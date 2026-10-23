import {
  defineEventHandler,
  getRequestHeader,
  setResponseHeader,
  setResponseStatus,
  type H3Event,
} from "h3";
import type { ApiError } from "~/lib/interfaces";
import { repairYoutubeLivePage } from "~/lib/youtubeLivePage";

// A chat poll is a small JSON request. A live-page HTML response is much
// larger, so it has a separate cap. Both streams are checked as they arrive:
// Content-Length alone does not cover chunked uploads or decoded responses.
const MAX_CHAT_REQUEST_BYTES = 1024 * 1024;
const MAX_UPSTREAM_RESPONSE_BYTES = 8 * 1024 * 1024;
const IO_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const YOUTUBE_ORIGIN = "https://www.youtube.com";

class ProxyHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readLimitedRequestBody(
  event: H3Event,
): Promise<Buffer | undefined> {
  const length = Number(getRequestHeader(event, "content-length"));
  if (length > MAX_CHAT_REQUEST_BYTES) {
    throw new ProxyHttpError(413, "Payload Too Large");
  }
  if (
    !length &&
    !/\bchunked\b/i.test(getRequestHeader(event, "transfer-encoding") ?? "")
  ) {
    return;
  }

  const chunks: Buffer[] = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    event.node.req.destroy(new Error("Request body timeout"));
  }, IO_TIMEOUT_MS);
  try {
    // Exiting this iterator on the byte limit must leave the socket intact
    // long enough for h3 to write the 413 response. The default async
    // iterator destroys the request stream when a loop throws.
    for await (const chunk of event.node.req.iterator({
      destroyOnReturn: false,
    })) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_CHAT_REQUEST_BYTES) {
        throw new ProxyHttpError(413, "Payload Too Large");
      }
      chunks.push(bytes);
    }
    return Buffer.concat(chunks, size);
  } catch (error) {
    if (timedOut) throw new ProxyHttpError(408, "Request Timeout");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readLimitedResponseBody(response: Response): Promise<Buffer> {
  const length = Number(response.headers.get("content-length"));
  if (length > MAX_UPSTREAM_RESPONSE_BYTES) {
    void response.body?.cancel().catch(console.error);
    throw new ProxyHttpError(502, "Upstream response too large");
  }
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_UPSTREAM_RESPONSE_BYTES) {
        throw new ProxyHttpError(502, "Upstream response too large");
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    void reader.cancel().catch(console.error);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

async function fetchYoutube(
  url: URL,
  init: RequestInit,
  signal: AbortSignal,
): Promise<Response> {
  let target = url;
  for (let redirects = 0; ; redirects++) {
    const response = await fetch(target.toString(), {
      ...init,
      redirect: "manual",
      signal,
    });
    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get("location");
    if (!location || init.method !== "GET") {
      void response.body?.cancel().catch(console.error);
      throw new ProxyHttpError(502, "Upstream redirect rejected");
    }
    const next = new URL(location, target);
    if (
      next.origin !== YOUTUBE_ORIGIN ||
      !isAllowedUpstreamPath("GET", next.pathname) ||
      redirects === MAX_REDIRECTS
    ) {
      void response.body?.cancel().catch(console.error);
      throw new ProxyHttpError(502, "Upstream redirect rejected");
    }
    void response.body?.cancel().catch(console.error);
    target = next;
  }
}

// youtube-chat (app/node_modules/youtube-chat/dist/requests.js) only ever
// makes four kinds of request through this proxy:
//   - GET  /watch?v=<id>              (fetchLivePage, by video id)
//   - GET  /channel/<channelId>/live  (fetchLivePage, by channel id)
//   - GET  /<handle>/live             (fetchLivePage, by handle)
//   - POST /youtubei/v1/live_chat/get_live_chat  (fetchChat, high-frequency polling)
// `<handle>` is free-form text the streamer types into the builder's "유튜브
// 채널 핸들" field, so it cannot be pattern-matched; the GET rule below
// instead matches any path ending in "/live", the one thing all three GET
// shapes have in common and nothing else on youtube.com needs.
function isAllowedUpstreamPath(method: string, pathname: string): boolean {
  if (method === "GET") {
    return pathname === "/watch" || pathname.endsWith("/live");
  }
  return pathname === "/youtubei/v1/live_chat/get_live_chat";
}

export default defineEventHandler(
  async (event): Promise<unknown | ApiError> => {
    try {
      if (!event.node.req.url) {
        return {
          status: "ERROR",
          error: "No url in request",
        };
      }
      if (!event.context.params?.path) {
        return {
          status: "ERROR",
          error: "No path in params",
        };
      }
      // The incoming URL can start with "//host", which URL treats as a new
      // authority. Copy only its query onto a fixed YouTube origin.
      const requestUrl = new URL(event.node.req.url, "https://www.youtube.com");
      const url = new URL("https://www.youtube.com");
      url.pathname = event.context.params.path;
      url.search = requestUrl.search;

      // event.method is h3's own accessor: it reads event.node.req.method,
      // defaults to "GET" when falsy, and upper-cases the result -- the same
      // fallback this line used to spell out manually, but exercised (and
      // therefore covered) by every test in this file instead of only by a
      // hypothetical falsy-method request.
      const method = event.method;
      if (method !== "GET" && method !== "POST") {
        setResponseStatus(event, 405);
        return { status: "ERROR", error: "Method Not Allowed" };
      }
      if (!isAllowedUpstreamPath(method, url.pathname)) {
        setResponseStatus(event, 404);
        return {
          status: "ERROR",
          error: "Not Found",
        };
      }

      // A proxied YouTube body must never be re-sniffed into an active
      // content type (e.g. HTML) on our own origin.
      setResponseHeader(event, "x-content-type-options", "nosniff");
      // GET may relay YouTube HTML under this app's own origin. If opened as
      // a document, it must have neither script execution nor this origin's
      // cookie/storage privileges. XHR consumers still receive the body.
      setResponseHeader(
        event,
        "content-security-policy",
        "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'",
      );

      // This signal covers connection setup and response-body reading, and is
      // reused across same-origin redirects so each hop cannot reset the cap.
      const signal = AbortSignal.timeout(IO_TIMEOUT_MS);

      if (method === "GET") {
        const upstreamResponse = await fetchYoutube(
          url,
          {
            method: "GET",
            headers: {
              host: url.host,
              origin: url.origin,
              referer: url.origin,
            },
          },
          signal,
        );
        const body = (await readLimitedResponseBody(upstreamResponse)).toString(
          "utf8",
        );
        const contentType = upstreamResponse.headers.get("content-type");
        if (contentType) {
          setResponseHeader(event, "content-type", contentType);
        }
        // Forward the upstream status (the POST branch below does this too)
        // so a 404/429/5xx from YouTube isn't laundered into a 200. The body
        // is still repaired regardless of status. Upstream Set-Cookie is
        // intentionally never read, let alone forwarded.
        setResponseStatus(event, upstreamResponse.status);
        return repairYoutubeLivePage(body);
      }

      // Only these four headers are ever sent upstream, built as an explicit
      // allowlist rather than copied from the incoming request. The overlay's
      // XHR to this same-origin proxy automatically attaches this site's
      // httpOnly CHZZK OAuth cookies; forwarding the incoming headers
      // wholesale (as h3's proxyRequest()/getProxyRequestHeaders() do -- they
      // exclude only transfer-encoding/accept-encoding/connection/keep-alive/
      // upgrade/expect/host/accept, and notably NOT cookie) would leak a
      // 30-day CHZZK refresh token to www.youtube.com on every chat poll.
      const outgoingHeaders: Record<string, string> = {
        host: url.host,
        origin: url.origin,
        referer: url.origin,
        "content-type":
          getRequestHeader(event, "content-type") ?? "application/json",
      };

      // A bounded stream preserves the exact request bytes. readRawBody()
      // buffers arbitrarily large chunked uploads before returning.
      const body = await readLimitedRequestBody(event);

      // Must be awaited: a rejected fetch() otherwise escapes this try block
      // entirely, since `return aPromise` from inside a try does not run
      // under the try/catch once the promise later rejects -- it just hands
      // the promise up to be adopted by this async function's own return.
      const upstreamResponse = await fetchYoutube(
        url,
        {
          method,
          headers: outgoingHeaders,
          body: body ? new Uint8Array(body) : undefined,
        },
        signal,
      );

      const contentType = upstreamResponse.headers.get("content-type");
      if (contentType) {
        setResponseHeader(event, "content-type", contentType);
      }
      setResponseStatus(event, upstreamResponse.status);
      // Upstream Set-Cookie is intentionally never read, let alone relayed
      // back to the client on our own origin.
      return new Uint8Array(await readLimitedResponseBody(upstreamResponse));
    } catch (error) {
      if (error instanceof ProxyHttpError) {
        setResponseStatus(event, error.status);
        if (error.status === 413 || error.status === 408) {
          setResponseHeader(event, "connection", "close");
        }
        return { status: "ERROR", error: error.message };
      }
      if (error instanceof Error && error.name === "TimeoutError") {
        setResponseStatus(event, 504);
        return { status: "ERROR", error: "Upstream Timeout" };
      }
      console.log("Youtube Live proxy Api Error");
      console.error(error);
      return {
        status: "ERROR",
        error: "Internal Server Error",
      };
    }
  },
);
