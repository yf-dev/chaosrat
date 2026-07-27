import { installH3Globals, createMockEvent } from "./h3TestHelpers";

installH3Globals();

describe("server/api/chzzk/auth/login", () => {
  it("returns an authUrl and sets an oauth_state cookie", async () => {
    const handler = (await import("~/server/api/chzzk/auth/login")).default;
    const { event, getResponseHeader } = createMockEvent({
      url: "/api/chzzk/auth/login",
    });

    const result = await handler(event);

    expect(result.status).toBe("OK");
    if (result.status !== "OK") throw new Error("unreachable");
    expect(result.authUrl).toContain(
      "https://chzzk.naver.com/account-interlock?",
    );
    expect(result.authUrl).toContain("clientId=fake-chzzk-client-id");
    expect(result.authUrl).toContain(
      "redirectUri=https%3A%2F%2Fchaosrat.test%2Fapi%2Fchzzk%2Fauth%2Fcallback",
    );

    const setCookieHeader = getResponseHeader("set-cookie");
    expect(setCookieHeader).toBeDefined();
    const cookies = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : [setCookieHeader];
    expect(cookies.some((c) => c?.startsWith("oauth_state="))).toBe(true);
  });

  it("stores oauth_redirect cookie when redirectTo query param is present", async () => {
    const handler = (await import("~/server/api/chzzk/auth/login")).default;
    const { event, getResponseHeader } = createMockEvent({
      url: "/api/chzzk/auth/login?redirectTo=%2Fchat",
    });

    await handler(event);

    const setCookieHeader = getResponseHeader("set-cookie");
    const cookies = (
      Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader]
    ) as string[];
    expect(cookies.some((c) => c.startsWith("oauth_redirect=%2Fchat"))).toBe(
      true,
    );
  });

  it("does not set an oauth_redirect cookie when redirectTo is absent", async () => {
    const handler = (await import("~/server/api/chzzk/auth/login")).default;
    const { event, getResponseHeader } = createMockEvent({
      url: "/api/chzzk/auth/login",
    });

    await handler(event);

    const setCookieHeader = getResponseHeader("set-cookie");
    const cookies = (
      Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader]
    ) as string[];
    expect(cookies.some((c) => c.startsWith("oauth_redirect="))).toBe(false);
  });

  it("returns internal_server_error when something inside the handler throws", async () => {
    const handler = (await import("~/server/api/chzzk/auth/login")).default;
    const { event } = createMockEvent({ url: "/api/chzzk/auth/login" });
    globalThis.useRuntimeConfig = vi.fn(() => {
      throw new Error("config boom");
    }) as unknown as typeof globalThis.useRuntimeConfig;

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "internal_server_error",
      error: "Internal Server Error",
    });

    // Restore, in case test order ever changes and a later test relies on it.
    installH3Globals();
  });
});
