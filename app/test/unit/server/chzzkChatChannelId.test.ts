import { installH3Globals, createMockEvent } from "./h3TestHelpers";

installH3Globals();

describe("server/api/chzzk/chatChannelId", () => {
  it("returns invalid_channel_id when the channelId query param is missing", async () => {
    const handler = (await import("~/server/api/chzzk/chatChannelId")).default;
    const { event } = createMockEvent({ url: "/api/chzzk/chatChannelId" });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "invalid_channel_id",
      error: "channelId param should be a string",
    });
  });

  it("returns the chatChannelId on success", async () => {
    globalThis.$fetch = vi.fn().mockResolvedValue({
      content: { chatChannelId: "chat-channel-1" },
    }) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/chatChannelId")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/chatChannelId?channelId=abc",
    });

    const result = await handler(event);

    expect(result).toEqual({ status: "OK", chatChannelId: "chat-channel-1" });
  });

  it("returns no_chat_channel_id when the response has no chatChannelId", async () => {
    globalThis.$fetch = vi.fn().mockResolvedValue({
      content: {},
    }) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/chatChannelId")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/chatChannelId?channelId=abc",
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "no_chat_channel_id",
      error: "No chatChannelId in response",
    });
  });

  it("returns internal_server_error when $fetch throws", async () => {
    globalThis.$fetch = vi
      .fn()
      .mockRejectedValue(
        new Error("network down"),
      ) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/chatChannelId")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/chatChannelId?channelId=abc",
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "internal_server_error",
      error: "Internal Server Error",
    });
  });
});
