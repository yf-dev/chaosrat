import { installH3Globals, createMockEvent } from "./h3TestHelpers";

installH3Globals();

// [...path].ts is a dual-path handler: GET requests (youtube-chat's live-page
// fetch) are read and repaired in-process via repairYoutubeLivePage(), while
// every other method (the high-frequency get_live_chat POST) keeps going
// through the original proxyRequest() pass-through untouched. Per the task
// scope we cover the shared guard logic (missing url / missing path param),
// the POST pass-through (URL assembly, the awaited-proxyRequest regression),
// and the GET branch's repair wiring, without asserting on proxyRequest's own
// internals (that's h3's own, already-tested code) or on repairYoutubeLivePage's
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

  it("builds the youtube.com target URL from the route path and forwards it via fetch (POST pass-through)", async () => {
    const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
      .default;
    // POST (not GET) so this exercises the proxyRequest() pass-through branch
    // rather than the live-page GET/repair branch.
    const { event } = createMockEvent({
      method: "POST",
      url: "/api/youtubeLive/proxy/some/path?foo=bar",
    });
    event.context.params = { path: "/some/path" };

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
      { headers: Headers },
    ];
    expect(target).toBe("https://www.youtube.com/some/path?foo=bar");
    expect(init.headers.get("host")).toBe("www.youtube.com");
    expect(init.headers.get("origin")).toBe("https://www.youtube.com");
    expect(init.headers.get("referer")).toBe("https://www.youtube.com");
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
      // exercise the proxyRequest() pass-through branch explicitly.
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

  it("maps a rejected proxyRequest (e.g. an upstream fetch failure) to the ERROR envelope instead of throwing", async () => {
    // Regression guard for the missing `await` on `return proxyRequest(...)`:
    // without it, a rejection from proxyRequest escapes the handler's own
    // try/catch (a `return aPromise` inside a try does not run under that
    // try/catch once the promise later rejects), so the handler throws
    // instead of returning the ERROR envelope.
    const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
      .default;
    // POST so this hits proxyRequest(), the branch the regression is about.
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
});
