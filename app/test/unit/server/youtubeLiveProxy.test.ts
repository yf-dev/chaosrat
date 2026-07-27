import { installH3Globals, createMockEvent } from "./h3TestHelpers";

installH3Globals();

/**
 * Reads a header value regardless of whether the outgoing `fetch()` call
 * received a plain headers object (this file's post-fix shape) or a real
 * `Headers` instance (h3's `proxyRequest()`/`mergeHeaders()` shape, from
 * before the fix). Using this instead of bracket access on `init.headers`
 * matters for the red phase of these tests: bracket access on a `Headers`
 * instance always returns `undefined` regardless of content, which would
 * make a `.toBeUndefined()` cookie assertion pass vacuously against the old,
 * vulnerable implementation instead of actually catching the leak.
 */
function headerValue(
  headers: Record<string, string> | Headers,
  name: string,
): string | undefined {
  if (headers && typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? undefined;
  }
  return (headers as Record<string, string>)[name];
}

// [...path].ts is a dual-path handler: GET requests (youtube-chat's live-page
// fetch) are read and repaired in-process via repairYoutubeLivePage(), while
// every other method (the high-frequency get_live_chat POST) is relayed with
// a plain fetch() call of its own -- NOT h3's proxyRequest(), which would
// forward the incoming request's headers wholesale, including this origin's
// httpOnly CHZZK OAuth cookies. Both branches are additionally gated by a
// path allowlist (only the four upstream shapes youtube-chat actually needs
// are reachable; everything else 404s before any fetch happens) and both set
// X-Content-Type-Options: nosniff on their response. Per the task scope we
// cover the shared guard logic (missing url / missing path param), the path
// allowlist, the POST branch's header allowlist / body passthrough / dropped
// Set-Cookie, the awaited-fetch regression, and the GET branch's repair
// wiring and header allowlist, without asserting on repairYoutubeLivePage's
// own logic (that's youtubeLivePage.test.ts's job).
describe("server/api/youtubeLive/proxy/[...path]", () => {
  it("returns an error when the incoming request has no url", async () => {
    const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
      .default;
    const { event } = createMockEvent({ url: "" });
    // createMockEvent defaults url to "/", force the falsy case explicitly.
    (event.node.req as unknown as { url: string }).url = "";

    const result = await handler(event);

    expect(result).toEqual({ status: "ERROR", error: "No url in request" });
  });

  it("returns an error when event.context.params.path is missing", async () => {
    const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
      .default;
    const { event } = createMockEvent({
      url: "/api/youtubeLive/proxy/some/path",
    });

    const result = await handler(event);

    expect(result).toEqual({ status: "ERROR", error: "No path in params" });
  });

  it("builds the youtube.com target URL from the route path and forwards it via a plain fetch relay", async () => {
    const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
      .default;
    // POST an allowlisted path so this exercises the fetch() relay branch
    // rather than the live-page GET/repair branch or the path allowlist's
    // rejection.
    const { event } = createMockEvent({
      method: "POST",
      url: "/api/youtubeLive/proxy/youtubei/v1/live_chat/get_live_chat?foo=bar",
    });
    event.context.params = { path: "/youtubei/v1/live_chat/get_live_chat" };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await handler(event);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [target, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(target).toBe(
      "https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?foo=bar",
    );
    expect(headerValue(init.headers, "host")).toBe("www.youtube.com");
    expect(headerValue(init.headers, "origin")).toBe("https://www.youtube.com");
    expect(headerValue(init.headers, "referer")).toBe(
      "https://www.youtube.com",
    );
  });

  it("builds the exact upstream URL for a realistic live-chat request, identically whether or not the route path carries a leading slash", async () => {
    // Regression pin for the client-side `updateUrl()` doubled-slash defect:
    // depending on whether that doubling is present, rou3's catch-all
    // `event.context.params.path` ends up either "/youtubei/v1/live_chat/..."
    // (leading slash, current/buggy client output) or "youtubei/v1/live_chat/..."
    // (no leading slash, fixed client output). Both must resolve to the same
    // upstream URL, since this handler has no control over the client fix.
    const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
      .default;
    const realisticQuery = "key=some-api-key&prettyPrint=false";
    const expectedTarget = `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?${realisticQuery}`;

    for (const path of [
      "/youtubei/v1/live_chat/get_live_chat", // leading slash (doubled-slash route)
      "youtubei/v1/live_chat/get_live_chat", // no leading slash (single-slash route)
    ]) {
      // get_live_chat is a real POST call (youtube-chat's fetchChat), so
      // exercise the fetch() relay branch explicitly.
      const { event } = createMockEvent({
        method: "POST",
        url: `/api/youtubeLive/proxy/youtubei/v1/live_chat/get_live_chat?${realisticQuery}`,
      });
      event.context.params = { path };

      const fetchMock = vi.fn().mockResolvedValue(
        new Response("ok", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      );
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      await handler(event);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [target] = fetchMock.mock.calls[0] as [string, unknown];
      expect(target).toBe(expectedTarget);
    }
  });

  it("maps a rejected fetch (e.g. an upstream failure) to the ERROR envelope instead of throwing", async () => {
    // Regression guard for a missing `await` on the outgoing fetch: without
    // it, a rejection escapes the handler's own try/catch (a `return
    // aPromise` inside a try does not run under that try/catch once the
    // promise later rejects), so the handler throws instead of returning the
    // ERROR envelope.
    const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
      .default;
    // POST so this hits the fetch() relay branch, the branch the regression
    // is about.
    const { event } = createMockEvent({
      method: "POST",
      url: "/api/youtubeLive/proxy/youtubei/v1/live_chat/get_live_chat?key=x",
    });
    event.context.params = { path: "youtubei/v1/live_chat/get_live_chat" };

    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      error: "Internal Server Error",
    });
  });

  it("returns an internal server error instead of crashing when the request url cannot be parsed", async () => {
    const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
      .default;
    const { event } = createMockEvent({
      // A syntactically malformed absolute-looking URL: `new URL(url, base)`
      // throws for this rather than falling back to the base.
      url: "http://[not-a-valid-host",
    });
    event.context.params = { path: "/some/path" };

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      error: "Internal Server Error",
    });
  });

  it("repairs a degraded live-page GET response's canonical tag", async () => {
    const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
      .default;
    const { event } = createMockEvent({
      method: "GET",
      url: "/api/youtubeLive/proxy/watch?v=whatever",
    });
    event.context.params = { path: "/watch" };

    const degradedHtml =
      '<html><head><link rel="canonical" href="undefined">' +
      '</head><body><script>var d = {"currentVideoEndpoint":{"commandMetadata":' +
      '{"webCommandMetadata":{"url":"/watch?v=REALID12345"}},"watchEndpoint":' +
      '{"videoId":"REALID12345"}}};</script></body></html>';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(degradedHtml, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await handler(event);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toContain(
      '<link rel="canonical" href="https://www.youtube.com/watch?v=REALID12345">',
    );
    expect(result).not.toContain('href="undefined"');
  });

  it("leaves a healthy live-page GET response unchanged", async () => {
    const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
      .default;
    const { event } = createMockEvent({
      method: "GET",
      url: "/api/youtubeLive/proxy/watch?v=whatever",
    });
    event.context.params = { path: "/watch" };

    const healthyHtml =
      '<html><head><link rel="canonical" href="https://www.youtube.com/watch?v=HEALTHY1234">' +
      "</head><body></body></html>";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(healthyHtml, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await handler(event);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toBe(healthyHtml);
  });

  it("does not set a content-type header when the upstream GET response has none", async () => {
    const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
      .default;
    const { event, getResponseHeader } = createMockEvent({
      method: "GET",
      url: "/api/youtubeLive/proxy/watch?v=whatever",
    });
    event.context.params = { path: "/watch" };

    // A string body would make the Fetch spec assign a default
    // "text/plain;charset=UTF-8" content-type; a byte body does not, which is
    // what's needed to exercise the "no content-type" branch below.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new TextEncoder().encode("<html></html>"), {
        status: 200,
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await handler(event);

    expect(getResponseHeader("content-type")).toBeUndefined();
  });

  it("does not set a content-type header when the upstream POST response has none", async () => {
    const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
      .default;
    const { event, getResponseHeader } = createMockEvent({
      method: "POST",
      url: "/api/youtubeLive/proxy/youtubei/v1/live_chat/get_live_chat?key=x",
    });
    event.context.params = { path: "youtubei/v1/live_chat/get_live_chat" };

    // A string body would make the Fetch spec assign a default
    // "text/plain;charset=UTF-8" content-type; a byte body does not, which is
    // what's needed to exercise the "no content-type" branch below.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new TextEncoder().encode("ok"), {
        status: 200,
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await handler(event);

    expect(getResponseHeader("content-type")).toBeUndefined();
  });

  it("forwards a non-200 upstream GET status onto the event instead of always answering 200", async () => {
    // Regression pin: the GET/repair branch used to return the repaired body
    // without ever calling setResponseStatus(), so a 404/429/5xx from YouTube
    // was silently laundered into an HTTP 200. The body must still be
    // repaired regardless of status.
    const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
      .default;
    const { event, getStatusCode } = createMockEvent({
      method: "GET",
      url: "/api/youtubeLive/proxy/watch?v=whatever",
    });
    event.context.params = { path: "/watch" };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<html><body>Too Many Requests</body></html>", {
        status: 429,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const result = await handler(event);

    expect(getStatusCode()).toBe(429);
    expect(result).toBe("<html><body>Too Many Requests</body></html>");
  });

  it("never forwards the incoming cookie or authorization header to youtube.com on the POST branch", async () => {
    // This is the core vulnerability this file exists to close: the overlay's
    // XHR to this same-origin proxy automatically attaches this site's
    // httpOnly CHZZK OAuth cookies (a 30-day refresh token among them).
    // h3's proxyRequest()/getProxyRequestHeaders() forward the incoming
    // request headers wholesale except for a small ignore list that does NOT
    // include "cookie" -- verified against a live h3 server before this fix.
    // The handler must build its outgoing headers as an explicit allowlist
    // instead of ever touching the incoming headers.
    const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
      .default;
    const { event } = createMockEvent({
      method: "POST",
      url: "/api/youtubeLive/proxy/youtubei/v1/live_chat/get_live_chat?key=x",
      headers: {
        cookie:
          "chzzk_access_token=SECRET_ACCESS_TOKEN; chzzk_refresh_token=SECRET_REFRESH_TOKEN",
        authorization: "Bearer nope",
        "content-type": "application/json",
      },
    });
    event.context.params = { path: "youtubei/v1/live_chat/get_live_chat" };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await handler(event);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(headerValue(init.headers, "cookie")).toBeUndefined();
    expect(headerValue(init.headers, "authorization")).toBeUndefined();
    // Positive assertions: the allowlisted headers are still present and
    // correct.
    expect(headerValue(init.headers, "host")).toBe("www.youtube.com");
    expect(headerValue(init.headers, "origin")).toBe("https://www.youtube.com");
    expect(headerValue(init.headers, "referer")).toBe(
      "https://www.youtube.com",
    );
    expect(headerValue(init.headers, "content-type")).toBe("application/json");
  });

  it("falls back to application/json for the outgoing content-type when the incoming request has none", async () => {
    const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
      .default;
    const { event } = createMockEvent({
      method: "POST",
      url: "/api/youtubeLive/proxy/youtubei/v1/live_chat/get_live_chat?key=x",
    });
    event.context.params = { path: "youtubei/v1/live_chat/get_live_chat" };

    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await handler(event);

    const [, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(headerValue(init.headers, "content-type")).toBe("application/json");
  });

  it("never forwards the incoming cookie header to youtube.com on the GET branch either", async () => {
    // Pin: the GET branch was already safe (it never derived headers from
    // the incoming request), but it deserves the same explicit regression
    // coverage as the POST branch above rather than relying on "it wasn't
    // reported broken".
    const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
      .default;
    const { event } = createMockEvent({
      method: "GET",
      url: "/api/youtubeLive/proxy/watch?v=whatever",
      headers: {
        cookie:
          "chzzk_access_token=SECRET_ACCESS_TOKEN; chzzk_refresh_token=SECRET_REFRESH_TOKEN",
        authorization: "Bearer nope",
      },
    });
    event.context.params = { path: "/watch" };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await handler(event);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(headerValue(init.headers, "cookie")).toBeUndefined();
    expect(headerValue(init.headers, "authorization")).toBeUndefined();
    expect(headerValue(init.headers, "host")).toBe("www.youtube.com");
    expect(headerValue(init.headers, "origin")).toBe("https://www.youtube.com");
    expect(headerValue(init.headers, "referer")).toBe(
      "https://www.youtube.com",
    );
  });

  it("forwards the request body bytes unchanged on the POST branch", async () => {
    const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
      .default;
    const rawBody = 'sid=abc&{"weird":"payload"} trailing';
    const { event } = createMockEvent({
      method: "POST",
      url: "/api/youtubeLive/proxy/youtubei/v1/live_chat/get_live_chat?key=x",
      body: rawBody,
    });
    event.context.params = { path: "youtubei/v1/live_chat/get_live_chat" };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await handler(event);

    const [, init] = fetchMock.mock.calls[0] as [string, { body: Buffer }];
    expect(Buffer.isBuffer(init.body)).toBe(true);
    expect(init.body.toString("utf8")).toBe(rawBody);
  });

  it("does not relay an upstream Set-Cookie header to the client on the POST branch", async () => {
    const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
      .default;
    const { event, getResponseHeader } = createMockEvent({
      method: "POST",
      url: "/api/youtubeLive/proxy/youtubei/v1/live_chat/get_live_chat?key=x",
    });
    event.context.params = { path: "youtubei/v1/live_chat/get_live_chat" };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: {
          "content-type": "text/plain",
          "set-cookie": "UPSTREAM_SESSION=abc; Path=/",
        },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await handler(event);

    expect(getResponseHeader("set-cookie")).toBeUndefined();
  });

  it("sets X-Content-Type-Options: nosniff on the POST branch's response", async () => {
    const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
      .default;
    const { event, getResponseHeader } = createMockEvent({
      method: "POST",
      url: "/api/youtubeLive/proxy/youtubei/v1/live_chat/get_live_chat?key=x",
    });
    event.context.params = { path: "youtubei/v1/live_chat/get_live_chat" };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await handler(event);

    expect(getResponseHeader("x-content-type-options")).toBe("nosniff");
  });

  it("sets X-Content-Type-Options: nosniff on the GET branch's response", async () => {
    const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
      .default;
    const { event, getResponseHeader } = createMockEvent({
      method: "GET",
      url: "/api/youtubeLive/proxy/watch?v=whatever",
    });
    event.context.params = { path: "/watch" };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await handler(event);

    expect(getResponseHeader("x-content-type-options")).toBe("nosniff");
  });

  describe("path allowlist", () => {
    it.each([
      ["POST", "/watch"],
      ["GET", "/some/other/path"],
      ["GET", "/sw.js"],
    ])(
      "rejects %s %s with a 404 and never calls fetch",
      async (method, path) => {
        const handler = (
          await import("~/server/api/youtubeLive/proxy/[...path]")
        ).default;
        const { event, getStatusCode } = createMockEvent({
          method,
          url: `/api/youtubeLive/proxy${path}`,
        });
        event.context.params = { path };

        const fetchMock = vi.fn();
        globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

        const result = await handler(event);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(getStatusCode()).toBe(404);
        expect(result).toMatchObject({ status: "ERROR" });
      },
    );

    it.each([
      ["POST", "/youtubei/v1/live_chat/get_live_chat"],
      ["GET", "/watch"],
      ["GET", "/channel/UC123/live"],
      ["GET", "/@somehandle/live"],
    ])("allows %s %s through to fetch", async (method, path) => {
      const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
        .default;
      const { event, getStatusCode } = createMockEvent({
        method,
        url: `/api/youtubeLive/proxy${path}`,
      });
      event.context.params = { path };

      const fetchMock = vi.fn().mockResolvedValue(
        new Response("ok", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      );
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      await handler(event);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(getStatusCode()).toBe(200);
    });
  });
});
