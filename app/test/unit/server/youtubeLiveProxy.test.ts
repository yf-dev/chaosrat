import { installH3Globals, createMockEvent } from "./h3TestHelpers";

installH3Globals();

// [...path].ts is a thin proxyRequest() pass-through; per the task scope we
// cover its own guard logic (missing url / missing path param) plus one
// success case that proves the target URL is assembled correctly, and skip
// asserting on proxyRequest's internals (that's h3's own, already-tested
// code).
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

  it("builds the youtube.com target URL from the route path and forwards it via fetch", async () => {
    const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
      .default;
    const { event } = createMockEvent({
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
      const { event } = createMockEvent({
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
    const { event } = createMockEvent({
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
});
