import { installH3Globals, createMockEvent } from "./h3TestHelpers";

installH3Globals();

// subscribeChat.ts and unsubscribeChat.ts are structurally identical (body
// validation + one $fetch call + a response.code check), differing only in
// the upstream endpoint path and their failure code string. Table-driving
// over both keeps the two real handlers under test without duplicating the
// whole suite by hand.
const routes = [
  {
    name: "subscribeChat",
    modulePath: "~/server/api/chzzk/session/subscribeChat",
    endpointPath: "/open/v1/sessions/events/subscribe/chat",
    failureCode: "failed_to_subscribe_chat",
    failureError: "Failed to subscribe chat",
  },
  {
    name: "unsubscribeChat",
    modulePath: "~/server/api/chzzk/session/unsubscribeChat",
    endpointPath: "/open/v1/sessions/events/unsubscribe/chat",
    failureCode: "failed_to_unsubscribe_chat",
    failureError: "Failed to unsubscribe chat",
  },
] as const;

describe.each(routes)(
  "server/api/chzzk/session/$name",
  ({ modulePath, endpointPath, failureCode, failureError }) => {
    it("returns not_logged_in without calling upstream when the access-token cookie is absent", async () => {
      const fetchMock = vi.fn();
      globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

      const handler = (await import(modulePath)).default;
      const { event } = createMockEvent({
        url: "/api/chzzk/session/x",
        method: "POST",
        body: { sessionKey: "session-1" },
      });

      const result = await handler(event);

      expect(result).toEqual({
        status: "ERROR",
        code: "not_logged_in",
        error: "User is not logged in",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns invalid_request when there is no body", async () => {
      const handler = (await import(modulePath)).default;
      const { event } = createMockEvent({
        url: "/api/chzzk/session/x",
        method: "POST",
        headers: { cookie: "chzzk_access_token=at-1" },
      });

      const result = await handler(event);

      expect(result).toEqual({
        status: "ERROR",
        code: "invalid_request",
        error: "Invalid request",
      });
    });

    it("returns invalid_request when sessionKey is missing", async () => {
      const handler = (await import(modulePath)).default;
      const { event } = createMockEvent({
        url: "/api/chzzk/session/x",
        method: "POST",
        headers: { cookie: "chzzk_access_token=at-1" },
        body: {},
      });

      const result = await handler(event);

      expect(result).toEqual({
        status: "ERROR",
        code: "invalid_request",
        error: "Invalid request",
      });
    });

    it("returns invalid_request when sessionKey is not a string", async () => {
      const handler = (await import(modulePath)).default;
      const { event } = createMockEvent({
        url: "/api/chzzk/session/x",
        method: "POST",
        headers: { cookie: "chzzk_access_token=at-1" },
        body: { sessionKey: 12345 },
      });

      const result = await handler(event);

      expect(result).toEqual({
        status: "ERROR",
        code: "invalid_request",
        error: "Invalid request",
      });
    });

    it("calls the correct upstream endpoint with the session key and bearer token, and returns OK on code 200", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue({ code: 200, message: null, content: null });
      globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

      const handler = (await import(modulePath)).default;
      const { event } = createMockEvent({
        url: "/api/chzzk/session/x",
        method: "POST",
        headers: { cookie: "chzzk_access_token=at-1" },
        body: { sessionKey: "session-1" },
      });

      const result = await handler(event);

      expect(result).toEqual({ status: "OK" });
      expect(fetchMock).toHaveBeenCalledWith(
        `https://openapi.chzzk.naver.com${endpointPath}`,
        expect.objectContaining({
          method: "POST",
          query: { sessionKey: "session-1" },
          headers: { Authorization: "Bearer at-1" },
        }),
      );
    });

    it(`returns ${failureCode} when the upstream response code is not 200`, async () => {
      globalThis.$fetch = vi.fn().mockResolvedValue({
        code: 500,
        message: "error",
        content: null,
      }) as unknown as typeof globalThis.$fetch;

      const handler = (await import(modulePath)).default;
      const { event } = createMockEvent({
        url: "/api/chzzk/session/x",
        method: "POST",
        headers: { cookie: "chzzk_access_token=at-1" },
        body: { sessionKey: "session-1" },
      });

      const result = await handler(event);

      expect(result).toEqual({
        status: "ERROR",
        code: failureCode,
        error: failureError,
      });
    });

    it("returns internal_server_error when $fetch throws", async () => {
      globalThis.$fetch = vi
        .fn()
        .mockRejectedValue(
          new Error("network down"),
        ) as unknown as typeof globalThis.$fetch;

      const handler = (await import(modulePath)).default;
      const { event } = createMockEvent({
        url: "/api/chzzk/session/x",
        method: "POST",
        headers: { cookie: "chzzk_access_token=at-1" },
        body: { sessionKey: "session-1" },
      });

      const result = await handler(event);

      expect(result).toEqual({
        status: "ERROR",
        code: "internal_server_error",
        error: "Internal Server Error",
      });
    });
  },
);
