import { installH3Globals, createMockEvent } from "./h3TestHelpers";

installH3Globals();

describe("server/api/chzzk/session/list", () => {
  it("returns not_logged_in without calling upstream when the access-token cookie is absent", async () => {
    const fetchMock = vi.fn();
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/session/list")).default;
    const { event } = createMockEvent({ url: "/api/chzzk/session/list" });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "not_logged_in",
      error: "User is not logged in",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns unauthorized when a 200-status response carries code: 401 in its body", async () => {
    globalThis.$fetch = vi.fn().mockResolvedValue({
      code: 401,
      message: "UNAUTHORIZED",
      content: undefined,
    }) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/session/list")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/session/list",
      headers: { cookie: "chzzk_access_token=stale-token-1" },
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "unauthorized",
      error: "Chzzk rejected the access token",
    });
  });

  it("returns unauthorized when $fetch throws with a response.status of 401", async () => {
    const error = { response: { status: 401 } };
    globalThis.$fetch = vi
      .fn()
      .mockRejectedValue(error) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/session/list")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/session/list",
      headers: { cookie: "chzzk_access_token=stale-token-2" },
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "unauthorized",
      error: "Chzzk rejected the access token",
    });
  });

  it("returns internal_server_error when $fetch throws for a non-401 reason", async () => {
    globalThis.$fetch = vi.fn().mockRejectedValue({
      response: { status: 500 },
    }) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/session/list")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/session/list",
      headers: { cookie: "chzzk_access_token=at-3" },
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "internal_server_error",
      error: "Internal Server Error",
    });
  });

  it("maps the session list on success", async () => {
    globalThis.$fetch = vi.fn().mockResolvedValue({
      code: 200,
      message: null,
      content: {
        data: [
          {
            sessionKey: "session-1",
            connectedDate: "2026-07-26T00:00:00Z",
            disconnectedDate: null,
            subscribedEvents: [{ eventType: "CHAT", channelId: "channel-1" }],
          },
        ],
      },
    }) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/session/list")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/session/list",
      headers: { cookie: "chzzk_access_token=at-4" },
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "OK",
      sessions: [
        {
          sessionKey: "session-1",
          connectedDate: "2026-07-26T00:00:00Z",
          disconnectedDate: null,
          subscribedEvents: [{ eventType: "CHAT", channelId: "channel-1" }],
        },
      ],
    });
  });

  it("defaults to an empty sessions array when content.data is missing", async () => {
    globalThis.$fetch = vi.fn().mockResolvedValue({
      code: 200,
      message: null,
      content: undefined,
    }) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/session/list")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/session/list",
      headers: { cookie: "chzzk_access_token=at-5" },
    });

    const result = await handler(event);

    expect(result).toEqual({ status: "OK", sessions: [] });
  });

  it("defaults subscribedEvents to an empty array when missing on an entry", async () => {
    globalThis.$fetch = vi.fn().mockResolvedValue({
      code: 200,
      message: null,
      content: {
        data: [
          {
            sessionKey: "session-2",
            connectedDate: null,
            disconnectedDate: null,
          },
        ],
      },
    }) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/session/list")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/session/list",
      headers: { cookie: "chzzk_access_token=at-6" },
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "OK",
      sessions: [
        {
          sessionKey: "session-2",
          connectedDate: null,
          disconnectedDate: null,
          subscribedEvents: [],
        },
      ],
    });
  });

  it("collapses concurrent calls sharing the same access token into a single upstream call", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      code: 200,
      message: null,
      content: { data: [] },
    });
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/session/list")).default;
    const { event: event1 } = createMockEvent({
      url: "/api/chzzk/session/list",
      headers: { cookie: "chzzk_access_token=shared-token" },
    });
    const { event: event2 } = createMockEvent({
      url: "/api/chzzk/session/list",
      headers: { cookie: "chzzk_access_token=shared-token" },
    });

    const [result1, result2] = await Promise.all([
      handler(event1),
      handler(event2),
    ]);

    expect(result1).toEqual({ status: "OK", sessions: [] });
    expect(result2).toEqual({ status: "OK", sessions: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
