import {
  defineEventHandler,
  getRequestHeader,
  readRawBody,
  setResponseHeader,
  setResponseStatus,
} from "h3";
import type { ApiError } from "~/lib/interfaces";
import { repairYoutubeLivePage } from "~/lib/youtubeLivePage";

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
      const url = new URL(event.node.req.url, "https://www.youtube.com");
      url.pathname = event.context.params.path;

      // event.method is h3's own accessor: it reads event.node.req.method,
      // defaults to "GET" when falsy, and upper-cases the result -- the same
      // fallback this line used to spell out manually, but exercised (and
      // therefore covered) by every test in this file instead of only by a
      // hypothetical falsy-method request.
      const method = event.method;
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

      if (method === "GET") {
        const upstreamResponse = await fetch(url.toString(), {
          headers: {
            host: url.host,
            origin: url.origin,
            referer: url.origin,
          },
        });
        const body = await upstreamResponse.text();
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

      // encoding=false preserves the exact request bytes; readBody() followed
      // by re-serialising would not guarantee a byte-for-byte round trip.
      const body = await readRawBody(event, false);

      // Must be awaited: a rejected fetch() otherwise escapes this try block
      // entirely, since `return aPromise` from inside a try does not run
      // under the try/catch once the promise later rejects -- it just hands
      // the promise up to be adopted by this async function's own return.
      const upstreamResponse = await fetch(url.toString(), {
        method,
        headers: outgoingHeaders,
        body,
      });

      const contentType = upstreamResponse.headers.get("content-type");
      if (contentType) {
        setResponseHeader(event, "content-type", contentType);
      }
      setResponseStatus(event, upstreamResponse.status);
      // Upstream Set-Cookie is intentionally never read, let alone relayed
      // back to the client on our own origin.
      return new Uint8Array(await upstreamResponse.arrayBuffer());
    } catch (error) {
      console.log("Youtube Live proxy Api Error");
      console.error(error);
      return {
        status: "ERROR",
        error: "Internal Server Error",
      };
    }
  },
);
