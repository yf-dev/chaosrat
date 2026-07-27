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

  it("returns the chatChannelId, liveStatus and openDate when the broadcast is live (OPEN)", async () => {
    globalThis.$fetch = vi.fn().mockResolvedValue({
      code: 200,
      content: {
        status: "OPEN",
        openDate: "2026-07-26 14:09:18",
        chatChannelId: "chat-channel-1",
      },
    }) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/chatChannelId")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/chatChannelId?channelId=abc",
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "OK",
      chatChannelId: "chat-channel-1",
      liveStatus: "OPEN",
      openDate: "2026-07-26 14:09:18",
    });
  });

  it("returns OK with a null chatChannelId when the channel is offline (CLOSE)", async () => {
    // Verified live upstream shape: chatChannelId is null (not omitted) when
    // the channel is not currently broadcasting.
    globalThis.$fetch = vi.fn().mockResolvedValue({
      code: 200,
      content: {
        status: "CLOSE",
        openDate: "2026-07-26 14:09:18",
        chatChannelId: null,
      },
    }) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/chatChannelId")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/chatChannelId?channelId=abc",
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "OK",
      chatChannelId: null,
      liveStatus: "CLOSE",
      openDate: "2026-07-26 14:09:18",
    });
  });

  it("defaults missing fields to null when content is present but sparse", async () => {
    globalThis.$fetch = vi.fn().mockResolvedValue({
      content: {},
    }) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/chatChannelId")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/chatChannelId?channelId=abc",
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "OK",
      chatChannelId: null,
      liveStatus: null,
      openDate: null,
    });
  });

  it("returns no_chat_channel_id when the response has no content object at all", async () => {
    globalThis.$fetch = vi.fn().mockResolvedValue({
      code: 200,
    }) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/chzzk/chatChannelId")).default;
    const { event } = createMockEvent({
      url: "/api/chzzk/chatChannelId?channelId=abc",
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      code: "no_chat_channel_id",
      error: "No content in response",
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
