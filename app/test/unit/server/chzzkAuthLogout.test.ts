import { installH3Globals, createMockEvent } from "./h3TestHelpers";

installH3Globals();

describe("server/api/chzzk/auth/logout", () => {
  it("clears cookies and returns OK without calling upstream when no tokens are present", async () => {
    const fetchMock = vi.fn();
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/auth/logout")).default;
    const { event, getResponseHeader } = createMockEvent({
      url: "/api/chzzk/auth/logout",
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
  });

  it("revokes both access and refresh tokens when present, then clears cookies", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ code: 200, message: null, content: null });
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/auth/logout")).default;
    const { event, getResponseHeader } = createMockEvent({
      url: "/api/chzzk/auth/logout",
      headers: { cookie: "chzzk_access_token=at-1; chzzk_refresh_token=rt-1" },
    });

    const result = await handler(event);

    expect(result).toEqual({ status: "OK" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
  });

  it("returns internal_server_error when something inside the handler throws", async () => {
    const handler = (await import("~/server/api/chzzk/auth/logout")).default;
    const { event } = createMockEvent({ url: "/api/chzzk/auth/logout" });
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
