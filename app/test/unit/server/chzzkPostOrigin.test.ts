import { installH3Globals, createMockEvent } from "./h3TestHelpers";

installH3Globals();

const routes = [
  ["auth/logout", () => import("~/server/api/chzzk/auth/logout")],
  ["auth/refresh", () => import("~/server/api/chzzk/auth/refresh")],
  ["session/open", () => import("~/server/api/chzzk/session/open")],
  [
    "session/subscribeChat",
    () => import("~/server/api/chzzk/session/subscribeChat"),
  ],
  [
    "session/unsubscribeChat",
    () => import("~/server/api/chzzk/session/unsubscribeChat"),
  ],
] as const;

describe("CHZZK state-changing routes", () => {
  it.each(routes)(
    "rejects a same-site sibling POST at %s",
    async (path, load) => {
      const upstream = vi.fn();
      globalThis.$fetch = upstream as unknown as typeof globalThis.$fetch;
      const { default: handler } = await load();
      const { event, getStatusCode, getResponseHeader } = createMockEvent({
        method: "POST",
        url: `/api/chzzk/${path}`,
        headers: {
          origin: "https://attacker.chaosrat.test",
          cookie: "chzzk_access_token=at; chzzk_refresh_token=rt",
        },
        body: { sessionKey: "session-key" },
      });

      expect(await handler(event)).toEqual({
        status: "ERROR",
        code: "forbidden_origin",
        error: "Forbidden Origin",
      });
      expect(getStatusCode()).toBe(403);
      expect(getResponseHeader("set-cookie")).toBeUndefined();
      expect(upstream).not.toHaveBeenCalled();
    },
  );

  it("rejects a POST with no Origin", async () => {
    const { default: handler } = await import("~/server/api/chzzk/auth/logout");
    const { event, getStatusCode } = createMockEvent({
      method: "POST",
      headers: { cookie: "chzzk_access_token=at" },
    });
    delete event.node.req.headers.origin;

    expect(await handler(event)).toEqual({
      status: "ERROR",
      code: "forbidden_origin",
      error: "Forbidden Origin",
    });
    expect(getStatusCode()).toBe(403);
  });

  it("allows an exact same-origin POST", async () => {
    const { default: handler } = await import("~/server/api/chzzk/auth/logout");
    const { event, getStatusCode } = createMockEvent({ method: "POST" });

    expect(await handler(event)).toEqual({ status: "OK" });
    expect(getStatusCode()).toBe(200);
  });

  it("rejects Origin: null against an HTTP app origin", async () => {
    const { default: handler } = await import("~/server/api/chzzk/auth/logout");
    const { event, getStatusCode } = createMockEvent({
      method: "POST",
      headers: { origin: "null" },
    });

    expect(await handler(event)).toMatchObject({ code: "forbidden_origin" });
    expect(getStatusCode()).toBe(403);
  });

  it("fails closed for a non-HTTP configured URL and Origin: null", async () => {
    globalThis.useRuntimeConfig = vi.fn(() => ({
      public: { baseURL: "file:///tmp/app" },
    })) as unknown as typeof globalThis.useRuntimeConfig;
    const { default: handler } = await import("~/server/api/chzzk/auth/logout");
    const { event, getStatusCode } = createMockEvent({
      method: "POST",
      headers: { origin: "null" },
    });

    expect(await handler(event)).toMatchObject({ code: "forbidden_origin" });
    expect(getStatusCode()).toBe(403);
    installH3Globals();
  });
});
