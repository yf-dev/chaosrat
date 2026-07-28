import { installH3Globals, createMockEvent } from "./h3TestHelpers";

// refresh.ts keeps its single-flight collapsing map at module scope, so each
// test gets a fresh module instance (and thus a fresh, empty flight) via
// resetModules + a fresh dynamic import. Otherwise a cached/in-flight entry
// from one test would leak into the next.
beforeEach(() => {
  vi.resetModules();
  installH3Globals();
});

describe("server/api/chzzk/auth/refresh", () => {
  it("rejects a GET request with 405 and does not call upstream (CSRF hardening)", async () => {
    const fetchMock = vi.fn();
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/auth/refresh")).default;
    const { event, getStatusCode } = createMockEvent({
      url: "/api/chzzk/auth/refresh",
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

  it("returns no_refresh_token without calling upstream when the cookie is absent", async () => {
    const fetchMock = vi.fn();
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/auth/refresh")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/auth/refresh",
      method: "POST",
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "no_refresh_token",
      error: "No refresh token found",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exchanges the refresh token and writes all three cookies on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      code: 200,
      message: null,
      content: {
        accessToken: "new-at",
        refreshToken: "new-rt",
        tokenType: "Bearer",
        expiresIn: 3600,
        scope: "chat",
      },
    });
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/auth/refresh")).default;
    const { event, getResponseHeader } = createMockEvent({
      url: "/api/chzzk/auth/refresh",
      method: "POST",
      headers: { cookie: "chzzk_refresh_token=rt-solo" },
    });

    const result = await handler(event);

    expect(result).toEqual({ status: "OK" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/v1/token",
      expect.objectContaining({
        body: expect.objectContaining({
          grantType: "refresh_token",
          refreshToken: "rt-solo",
        }),
      }),
    );

    const setCookieHeader = getResponseHeader("set-cookie") as string[];
    expect(
      setCookieHeader.some((c) => c.startsWith("chzzk_access_token=new-at")),
    ).toBe(true);
    expect(
      setCookieHeader.some((c) => c.startsWith("chzzk_refresh_token=new-rt")),
    ).toBe(true);
    expect(
      setCookieHeader.some((c) => c.startsWith("chzzk_token_created_at=")),
    ).toBe(true);
  });

  it("collapses concurrent requests sharing the same (single-use) refresh token into one upstream exchange, and still writes cookies for every caller", async () => {
    let resolveFetch!: (value: unknown) => void;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(fetchPromise);
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/auth/refresh")).default;

    const call1 = createMockEvent({
      url: "/api/chzzk/auth/refresh",
      method: "POST",
      headers: { cookie: "chzzk_refresh_token=rt-shared" },
    });
    const call2 = createMockEvent({
      url: "/api/chzzk/auth/refresh",
      method: "POST",
      headers: { cookie: "chzzk_refresh_token=rt-shared" },
    });

    const p1 = handler(call1.event);
    const p2 = handler(call2.event);

    // Let both calls reach refreshFlight.run() (and join the same in-flight
    // promise) before the upstream call resolves.
    await new Promise((r) => setImmediate(r));
    resolveFetch({
      code: 200,
      message: null,
      content: {
        accessToken: "new-at",
        refreshToken: "new-rt",
        tokenType: "Bearer",
        expiresIn: 3600,
        scope: "chat",
      },
    });

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r1).toEqual({ status: "OK" });
    expect(r2).toEqual({ status: "OK" });

    for (const call of [call1, call2]) {
      const setCookieHeader = call.getResponseHeader("set-cookie") as
        string[] | undefined;
      expect(setCookieHeader).toBeDefined();
      expect(
        setCookieHeader!.some((c) => c.startsWith("chzzk_access_token=new-at")),
      ).toBe(true);
      expect(
        setCookieHeader!.some((c) =>
          c.startsWith("chzzk_refresh_token=new-rt"),
        ),
      ).toBe(true);
      expect(
        setCookieHeader!.some((c) => c.startsWith("chzzk_token_created_at=")),
      ).toBe(true);
    }
  });

  it("serves the cached rotated pair (no second upstream exchange) to a straggler that replays the pre-rotation cookie more than 60s but less than 10 minutes later, and still writes cookies for it", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockResolvedValue({
        code: 200,
        message: null,
        content: {
          accessToken: "new-at",
          refreshToken: "new-rt",
          tokenType: "Bearer",
          expiresIn: 3600,
          scope: "chat",
        },
      });
      globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

      const handler = (await import("~/server/api/chzzk/auth/refresh")).default;

      const call1 = createMockEvent({
        url: "/api/chzzk/auth/refresh",
        method: "POST",
        headers: { cookie: "chzzk_refresh_token=rt-straggler" },
      });
      const result1 = await handler(call1.event);
      expect(result1).toEqual({ status: "OK" });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // A second OBS Browser Source with its own cookie jar, still holding
      // the now-spent refresh token, replays it well past the old 60s window
      // but inside the widened 10-minute one.
      await vi.advanceTimersByTimeAsync(90_000);

      const call2 = createMockEvent({
        url: "/api/chzzk/auth/refresh",
        method: "POST",
        headers: { cookie: "chzzk_refresh_token=rt-straggler" },
      });
      const result2 = await handler(call2.event);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result2).toEqual({ status: "OK" });

      const setCookieHeader = call2.getResponseHeader("set-cookie") as
        string[] | undefined;
      expect(setCookieHeader).toBeDefined();
      expect(
        setCookieHeader!.some((c) => c.startsWith("chzzk_access_token=new-at")),
      ).toBe(true);
      expect(
        setCookieHeader!.some((c) =>
          c.startsWith("chzzk_refresh_token=new-rt"),
        ),
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("performs a fresh upstream exchange once the 10-minute cache window has elapsed", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          code: 200,
          message: null,
          content: {
            accessToken: "first-at",
            refreshToken: "first-rt",
            tokenType: "Bearer",
            expiresIn: 3600,
            scope: "chat",
          },
        })
        .mockResolvedValueOnce({
          code: 200,
          message: null,
          content: {
            accessToken: "second-at",
            refreshToken: "second-rt",
            tokenType: "Bearer",
            expiresIn: 3600,
            scope: "chat",
          },
        });
      globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

      const handler = (await import("~/server/api/chzzk/auth/refresh")).default;

      const call1 = createMockEvent({
        url: "/api/chzzk/auth/refresh",
        method: "POST",
        headers: { cookie: "chzzk_refresh_token=rt-stale" },
      });
      await handler(call1.event);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(10 * 60_000 + 1);

      const call2 = createMockEvent({
        url: "/api/chzzk/auth/refresh",
        method: "POST",
        headers: { cookie: "chzzk_refresh_token=rt-stale" },
      });
      const result2 = await handler(call2.event);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result2).toEqual({ status: "OK" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not collapse requests carrying distinct refresh tokens", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        (
          _url: string,
          opts: { body: { refreshToken: string } },
        ): Promise<unknown> =>
          Promise.resolve({
            code: 200,
            message: null,
            content: {
              accessToken: `at-for-${opts.body.refreshToken}`,
              refreshToken: `rt2-for-${opts.body.refreshToken}`,
              tokenType: "Bearer",
              expiresIn: 3600,
              scope: "chat",
            },
          }),
      );
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/auth/refresh")).default;

    const callA = createMockEvent({
      url: "/api/chzzk/auth/refresh",
      method: "POST",
      headers: { cookie: "chzzk_refresh_token=rt-A" },
    });
    const callB = createMockEvent({
      url: "/api/chzzk/auth/refresh",
      method: "POST",
      headers: { cookie: "chzzk_refresh_token=rt-B" },
    });

    await Promise.all([handler(callA.event), handler(callB.event)]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns invalid_token when the upstream response is missing required fields", async () => {
    globalThis.$fetch = vi.fn().mockResolvedValue({
      code: 200,
      message: null,
      content: undefined,
    }) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/auth/refresh")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/auth/refresh",
      method: "POST",
      headers: { cookie: "chzzk_refresh_token=rt-bad" },
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "invalid_token",
      error: "Failed to refresh Chzzk access token",
    });
  });

  it("returns invalid_token when the upstream exchange throws", async () => {
    globalThis.$fetch = vi
      .fn()
      .mockRejectedValue(
        new Error("network down"),
      ) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/auth/refresh")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/auth/refresh",
      method: "POST",
      headers: { cookie: "chzzk_refresh_token=rt-bad" },
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "invalid_token",
      error: "Failed to refresh Chzzk access token",
    });
  });

  it("returns internal_server_error when something inside the handler throws, outside the inner refresh try/catch", async () => {
    globalThis.$fetch = vi.fn() as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/auth/refresh")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/auth/refresh",
      method: "POST",
      headers: { cookie: "chzzk_refresh_token=rt-bad" },
    });
    globalThis.useRuntimeConfig = vi.fn(() => {
      throw new Error("config boom");
    }) as unknown as typeof globalThis.useRuntimeConfig;

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "internal_server_error",
      error: "Internal Server Error",
    });
  });
});
