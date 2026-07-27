import { installH3Globals, createMockEvent } from "./h3TestHelpers";

installH3Globals();

describe("server/api/chzzk/auth/callback", () => {
  beforeEach(() => {
    globalThis.$fetch = vi.fn() as unknown as typeof globalThis.$fetch;
  });

  it("returns internal_server_error when the code query param is missing (uncaught createError bubbles to the outer catch)", async () => {
    const handler = (await import("~/server/api/chzzk/auth/callback")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/auth/callback?state=abc",
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "internal_server_error",
      error: "Internal Server Error",
    });
  });

  it("rejects when there is no stored oauth_state cookie", async () => {
    const handler = (await import("~/server/api/chzzk/auth/callback")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/auth/callback?code=abc123&state=xyz",
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "invalid_state",
      error: "Invalid state parameter",
    });
  });

  it("rejects when the query state does not match the stored oauth_state cookie", async () => {
    const handler = (await import("~/server/api/chzzk/auth/callback")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/auth/callback?code=abc123&state=wrong-state",
      headers: { cookie: "oauth_state=correct-state" },
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "invalid_state",
      error: "Invalid state parameter",
    });
  });

  it("rejects a tampered oauth_redirect cookie that does not start with '/'", async () => {
    const handler = (await import("~/server/api/chzzk/auth/callback")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/auth/callback?code=abc123&state=good-state",
      headers: {
        cookie:
          "oauth_state=good-state; oauth_redirect=https://evil.example.com",
      },
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "invalid_redirect",
      error: "Invalid redirect URL",
    });
  });

  it("exchanges the code, sets the three token cookies, and redirects on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      code: 200,
      message: null,
      content: {
        accessToken: "fake-access-token",
        refreshToken: "fake-refresh-token",
        tokenType: "Bearer",
        expiresIn: 3600,
        scope: "chat",
      },
    });
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/auth/callback")).default;
    const { event, getResponseHeader } = createMockEvent({
      url: "/api/chzzk/auth/callback?code=abc123&state=good-state",
      headers: { cookie: "oauth_state=good-state; oauth_redirect=%2Fchat" },
    });

    await handler(event);

    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/v1/token",
      expect.objectContaining({
        baseURL: "https://chzzk.naver.com",
        method: "POST",
        body: expect.objectContaining({
          grantType: "authorization_code",
          code: "abc123",
          clientId: "fake-chzzk-client-id",
          clientSecret: "fake-chzzk-client-secret",
        }),
      }),
    );

    const setCookieHeader = getResponseHeader("set-cookie") as string[];
    expect(
      setCookieHeader.some((c) =>
        c.startsWith("chzzk_access_token=fake-access-token"),
      ),
    ).toBe(true);
    expect(
      setCookieHeader.some((c) =>
        c.startsWith("chzzk_refresh_token=fake-refresh-token"),
      ),
    ).toBe(true);
    expect(
      setCookieHeader.some((c) => c.startsWith("chzzk_token_created_at=")),
    ).toBe(true);

    expect(getResponseHeader("location")).toBe("/chat");
  });

  it("returns invalid_token when the token exchange response is missing required fields", async () => {
    globalThis.$fetch = vi.fn().mockResolvedValue({
      code: 200,
      message: null,
      content: undefined,
    }) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/auth/callback")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/auth/callback?code=abc123&state=good-state",
      headers: { cookie: "oauth_state=good-state" },
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "invalid_token",
      error: "Failed to get Chzzk access token",
    });
  });

  it("returns invalid_token when the upstream token exchange throws", async () => {
    globalThis.$fetch = vi
      .fn()
      .mockRejectedValue(
        new Error("network down"),
      ) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/auth/callback")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/auth/callback?code=abc123&state=good-state",
      headers: { cookie: "oauth_state=good-state" },
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "invalid_token",
      error: "Failed to get Chzzk access token",
    });
  });
});
