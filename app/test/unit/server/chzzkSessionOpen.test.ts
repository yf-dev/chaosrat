import { installH3Globals, createMockEvent } from "./h3TestHelpers";

installH3Globals();

describe("server/api/chzzk/session/open", () => {
  it("rejects a GET request with 405 and does not call upstream (CSRF hardening)", async () => {
    const fetchMock = vi.fn();
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/session/open")).default;
    const { event, getStatusCode } = createMockEvent({
      url: "/api/chzzk/session/open",
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

  it("returns not_logged_in without calling upstream when the access-token cookie is absent", async () => {
    const fetchMock = vi.fn();
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/session/open")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/session/open",
      method: "POST",
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "not_logged_in",
      error: "User is not logged in",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the session url on success", async () => {
    globalThis.$fetch = vi.fn().mockResolvedValue({
      code: 200,
      message: null,
      content: { url: "wss://sessions.example/socket" },
    }) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/session/open")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/session/open",
      method: "POST",
      headers: { cookie: "chzzk_access_token=at-1" },
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "OK",
      url: "wss://sessions.example/socket",
    });
  });

  it("returns unauthorized when a 200-status response carries code: 401 in its body", async () => {
    globalThis.$fetch = vi.fn().mockResolvedValue({
      code: 401,
      message: "UNAUTHORIZED",
      content: undefined,
    }) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/session/open")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/session/open",
      method: "POST",
      headers: { cookie: "chzzk_access_token=stale-token" },
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "unauthorized",
      error: "Chzzk rejected the access token",
    });
  });

  it("returns unauthorized when $fetch throws with a response.status of 401 (ofetch FetchError shape)", async () => {
    const error = { response: { status: 401 } };
    globalThis.$fetch = vi
      .fn()
      .mockRejectedValue(error) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/session/open")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/session/open",
      method: "POST",
      headers: { cookie: "chzzk_access_token=stale-token" },
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "unauthorized",
      error: "Chzzk rejected the access token",
    });
  });

  it("returns unauthorized when $fetch throws with a top-level statusCode of 401", async () => {
    const error = { statusCode: 401 };
    globalThis.$fetch = vi
      .fn()
      .mockRejectedValue(error) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/session/open")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/session/open",
      method: "POST",
      headers: { cookie: "chzzk_access_token=stale-token" },
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "unauthorized",
      error: "Chzzk rejected the access token",
    });
  });

  it("returns unauthorized when $fetch throws with a top-level status of 401", async () => {
    const error = { status: 401 };
    globalThis.$fetch = vi
      .fn()
      .mockRejectedValue(error) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/session/open")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/session/open",
      method: "POST",
      headers: { cookie: "chzzk_access_token=stale-token" },
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

    const handler = (await import("~/server/api/chzzk/session/open")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/session/open",
      method: "POST",
      headers: { cookie: "chzzk_access_token=at-1" },
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "internal_server_error",
      error: "Internal Server Error",
    });
  });

  it("returns failed_to_open_session when the response has no content.url and code is not 401", async () => {
    globalThis.$fetch = vi.fn().mockResolvedValue({
      code: 200,
      message: null,
      content: undefined,
    }) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/session/open")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/session/open",
      method: "POST",
      headers: { cookie: "chzzk_access_token=at-1" },
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "failed_to_open_session",
      error: "Failed to open session",
    });
  });
});
