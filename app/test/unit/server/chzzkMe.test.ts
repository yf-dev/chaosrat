import { installH3Globals, createMockEvent } from "./h3TestHelpers";

// me.ts keeps its 30s single-flight cache at module scope, so each test gets
// a fresh module instance (fresh, empty cache) via resetModules + a fresh
// dynamic import.
beforeEach(() => {
  vi.resetModules();
  installH3Globals();
});

describe("server/api/chzzk/me", () => {
  it("returns not_logged_in without calling upstream when the access-token cookie is absent", async () => {
    const fetchMock = vi.fn();
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/me")).default;
    const { event } = createMockEvent({ url: "/api/chzzk/me" });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "not_logged_in",
      error: "User is not logged in",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the channel identity on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      code: 200,
      message: null,
      content: { channelId: "chan-1", channelName: "Streamer" },
    });
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/me")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/me",
      headers: { cookie: "chzzk_access_token=at-1" },
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "OK",
      channelId: "chan-1",
      channelName: "Streamer",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openapi.chzzk.naver.com/open/v1/users/me",
      expect.objectContaining({
        headers: { Authorization: "Bearer at-1" },
      }),
    );
  });

  it("caches the identity for the same access token: a second call within 30s does not hit upstream again", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      code: 200,
      message: null,
      content: { channelId: "chan-1", channelName: "Streamer" },
    });
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/me")).default;

    const first = await handler(
      createMockEvent({
        url: "/api/chzzk/me",
        headers: { cookie: "chzzk_access_token=at-1" },
      }).event,
    );
    const second = await handler(
      createMockEvent({
        url: "/api/chzzk/me",
        headers: { cookie: "chzzk_access_token=at-1" },
      }).event,
    );

    expect(first).toEqual({
      status: "OK",
      channelId: "chan-1",
      channelName: "Streamer",
    });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not share the cache across different access tokens (a token rotation is an immediate cache miss)", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        (
          _url: string,
          opts: { headers: { Authorization: string } },
        ): Promise<unknown> =>
          Promise.resolve({
            code: 200,
            message: null,
            content: {
              channelId: `chan-for-${opts.headers.Authorization}`,
              channelName: "Streamer",
            },
          }),
      );
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/me")).default;

    await handler(
      createMockEvent({
        url: "/api/chzzk/me",
        headers: { cookie: "chzzk_access_token=at-1" },
      }).event,
    );
    await handler(
      createMockEvent({
        url: "/api/chzzk/me",
        headers: { cookie: "chzzk_access_token=at-2" },
      }).event,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns failed_to_get_user_info (and does not cache the failure) when the upstream response is missing identity fields", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ code: 200, message: null, content: undefined });
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/me")).default;

    const first = await handler(
      createMockEvent({
        url: "/api/chzzk/me",
        headers: { cookie: "chzzk_access_token=at-1" },
      }).event,
    );
    expect(first).toEqual({
      status: "ERROR",
      code: "failed_to_get_user_info",
      error: "Failed to get user info",
    });

    // A failure must not be cached: a second call with the same token has to
    // retry upstream rather than replaying the failure (or a stale success).
    fetchMock.mockResolvedValueOnce({
      code: 200,
      message: null,
      content: { channelId: "chan-1", channelName: "Streamer" },
    });
    const second = await handler(
      createMockEvent({
        url: "/api/chzzk/me",
        headers: { cookie: "chzzk_access_token=at-1" },
      }).event,
    );

    expect(second).toEqual({
      status: "OK",
      channelId: "chan-1",
      channelName: "Streamer",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns internal_server_error when the upstream call throws a generic error", async () => {
    globalThis.$fetch = vi
      .fn()
      .mockRejectedValue(
        new Error("network down"),
      ) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/me")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/me",
      headers: { cookie: "chzzk_access_token=at-1" },
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "internal_server_error",
      error: "Internal Server Error",
    });
  });
});
