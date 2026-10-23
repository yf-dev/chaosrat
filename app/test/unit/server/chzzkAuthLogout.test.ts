import { installH3Globals, createMockEvent } from "./h3TestHelpers";

installH3Globals();

describe("server/api/chzzk/auth/logout", () => {
  it("rejects a sibling-origin form POST before revoking cookies", async () => {
    const fetchMock = vi.fn();
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;
    const handler = (await import("~/server/api/chzzk/auth/logout")).default;
    const { event, getStatusCode, getResponseHeader } = createMockEvent({
      url: "/api/chzzk/auth/logout",
      method: "POST",
      headers: {
        origin: "https://attacker.chaosrat.test",
        cookie: "chzzk_access_token=at-1; chzzk_refresh_token=rt-1",
      },
    });

    const result = await handler(event);

    expect(getStatusCode()).toBe(403);
    expect(result).toEqual({
      status: "ERROR",
      code: "forbidden_origin",
      error: "Forbidden Origin",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getResponseHeader("set-cookie")).toBeUndefined();
  });

  it("rejects a GET request with 405 and does not call upstream (CSRF hardening)", async () => {
    const fetchMock = vi.fn();
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/auth/logout")).default;
    const { event, getStatusCode } = createMockEvent({
      url: "/api/chzzk/auth/logout",
      method: "GET",
    });

    const result = await handler(event);

    expect(getStatusCode()).toBe(405);
    expect(result).toEqual({
      status: "ERROR",
      code: "method_not_allowed",
      error: "Method Not Allowed",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears cookies and returns OK without calling upstream when no tokens are present", async () => {
    const fetchMock = vi.fn();
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/auth/logout")).default;
    const { event, getResponseHeader } = createMockEvent({
      url: "/api/chzzk/auth/logout",
      method: "POST",
    });

    const result = await handler(event);

    expect(result).toEqual({ status: "OK" });
    expect(fetchMock).not.toHaveBeenCalled();

    const setCookieHeader = getResponseHeader("set-cookie") as string[];
    expect(
      setCookieHeader.some((c) => c.startsWith("chzzk_access_token=;")),
    ).toBe(true);
    expect(
      setCookieHeader.some((c) => c.startsWith("chzzk_refresh_token=;")),
    ).toBe(true);
    expect(
      setCookieHeader.some((c) => c.startsWith("chzzk_token_created_at=;")),
    ).toBe(true);
  });

  it("revokes both access and refresh tokens when present, then clears cookies", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ code: 200, message: null, content: null });
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/auth/logout")).default;
    const { event, getResponseHeader } = createMockEvent({
      url: "/api/chzzk/auth/logout",
      method: "POST",
      headers: { cookie: "chzzk_access_token=at-1; chzzk_refresh_token=rt-1" },
    });

    const result = await handler(event);

    expect(result).toEqual({ status: "OK" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, options] of fetchMock.mock.calls) {
      expect(options).toEqual(expect.objectContaining({ timeout: 5000 }));
    }
    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/v1/token/revoke",
      expect.objectContaining({
        body: expect.objectContaining({
          token: "at-1",
          tokenTypeHint: "access_token",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/v1/token/revoke",
      expect.objectContaining({
        body: expect.objectContaining({
          token: "rt-1",
          tokenTypeHint: "refresh_token",
        }),
      }),
    );

    const setCookieHeader = getResponseHeader("set-cookie") as string[];
    expect(
      setCookieHeader.some((c) => c.startsWith("chzzk_access_token=;")),
    ).toBe(true);
    expect(
      setCookieHeader.some((c) => c.startsWith("chzzk_refresh_token=;")),
    ).toBe(true);
    expect(
      setCookieHeader.some((c) => c.startsWith("chzzk_token_created_at=;")),
    ).toBe(true);
  });

  it("still clears cookies and returns OK even if both revocation calls fail", async () => {
    globalThis.$fetch = vi
      .fn()
      .mockRejectedValue(
        new Error("upstream down"),
      ) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/auth/logout")).default;
    const { event, getResponseHeader } = createMockEvent({
      url: "/api/chzzk/auth/logout",
      method: "POST",
      headers: { cookie: "chzzk_access_token=at-1; chzzk_refresh_token=rt-1" },
    });

    const result = await handler(event);

    expect(result).toEqual({ status: "OK" });
    const setCookieHeader = getResponseHeader("set-cookie") as string[];
    expect(
      setCookieHeader.some((c) => c.startsWith("chzzk_access_token=;")),
    ).toBe(true);
    expect(
      setCookieHeader.some((c) => c.startsWith("chzzk_refresh_token=;")),
    ).toBe(true);
    expect(
      setCookieHeader.some((c) => c.startsWith("chzzk_token_created_at=;")),
    ).toBe(true);
  });

  it("fails closed when the configured app origin cannot be read", async () => {
    const handler = (await import("~/server/api/chzzk/auth/logout")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/auth/logout",
      method: "POST",
    });
    globalThis.useRuntimeConfig = vi.fn(() => {
      throw new Error("config boom");
    }) as unknown as typeof globalThis.useRuntimeConfig;

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "forbidden_origin",
      error: "Forbidden Origin",
    });

    // Restore, in case test order ever changes and a later test relies on it.
    installH3Globals();
  });

  it("returns an error without revoking tokens if cookie parsing fails", async () => {
    const fetchMock = vi.fn();
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;
    const handler = (await import("~/server/api/chzzk/auth/logout")).default;
    const { event, getResponseHeader } = createMockEvent({
      url: "/api/chzzk/auth/logout",
      method: "POST",
    });
    Object.assign(globalThis, {
      getCookie: vi.fn(() => {
        throw new Error("cookie parser failed");
      }),
    });

    try {
      expect(await handler(event)).toEqual({
        status: "ERROR",
        code: "internal_server_error",
        error: "Internal Server Error",
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(getResponseHeader("set-cookie")).toBeUndefined();
      expect(getResponseHeader("cache-control")).toBe("private, no-store");
    } finally {
      installH3Globals();
    }
  });
});
