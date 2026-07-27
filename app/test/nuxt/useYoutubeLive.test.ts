import { createPinia, setActivePinia } from "pinia";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { defineComponent, reactive } from "vue";
import type { LocationQuery, RouteLocationNormalizedLoaded } from "vue-router";
import type { ChatItem as YoutubeChatItem } from "youtube-chat/dist/types/data";

// `useYoutubeLive` wraps `youtube-chat`'s `LiveChat` class, mocked out
// completely here (a fake instance whose `on(event, handler)` registrations
// are captured so tests can invoke them directly). What's under test:
// message normalisation into a ChatItem (youtubeLiveChatText,
// handleYoutubeLiveEmojis, handleYoutubeLiveBadges), maxChatSize trimming,
// broadcaster-message interception (chatItem.isOwner), and clearChat.
// `LiveChat`'s own polling/reconnect ("end" -> retry after 1s) is thin
// wiring over the library and is not exercised here.

function fakeRoute(query: LocationQuery): RouteLocationNormalizedLoaded {
  return { query } as unknown as RouteLocationNormalizedLoaded;
}

mockNuxtImport("useRoute", () => {
  return vi.fn(() => fakeRoute({}));
});

type LiveChatHandler = (...args: unknown[]) => void;

const { mockLiveChat } = vi.hoisted(() => {
  const handlers: Record<string, LiveChatHandler> = {};
  const instance = {
    handlers,
    on: vi.fn((event: string, handler: LiveChatHandler) => {
      handlers[event] = handler;
      return instance;
    }),
    start: vi.fn(async () => true),
    stop: vi.fn(),
    removeAllListeners: vi.fn(),
  };
  return { mockLiveChat: instance };
});

vi.mock("youtube-chat", () => ({
  LiveChat: vi.fn(function LiveChat() {
    return mockLiveChat;
  }),
}));

function setUp(query: LocationQuery = {}) {
  setActivePinia(createPinia());
  vi.mocked(useRoute).mockReturnValue(fakeRoute(query));
  mockLiveChat.on.mockClear();
  mockLiveChat.start.mockClear();
  mockLiveChat.start.mockResolvedValue(true);
  mockLiveChat.stop.mockClear();
  mockLiveChat.removeAllListeners.mockClear();
  for (const key of Object.keys(mockLiveChat.handlers)) {
    mockLiveChat.handlers[key] = () => {};
  }
}

// Wait for `initChat`'s async chain (new LiveChat -> await start()) to
// settle, since the `watch(..., { immediate: true })` that triggers it
// isn't awaited by useYoutubeLive() itself.
async function flushInitChat() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function baseYoutubeChatItem(
  overrides: Partial<YoutubeChatItem> = {},
): YoutubeChatItem {
  return {
    id: "chat-1",
    author: { name: "some_viewer", channelId: "channel-1" },
    message: [{ text: "hello" }],
    isMembership: false,
    isVerified: false,
    isOwner: false,
    isModerator: false,
    timestamp: new Date(),
    ...overrides,
  } as YoutubeChatItem;
}

function emitChat(item: YoutubeChatItem) {
  mockLiveChat.handlers["chat"](item);
}

describe("useYoutubeLive", () => {
  it("normalises a chat message into a ChatItem with the expected shape", async () => {
    setUp({ youtubeHandle: "@somechannel" });
    const { chatItems } = useYoutubeLive({});
    await flushInitChat();

    emitChat(
      baseYoutubeChatItem({
        id: "abc-123",
        author: { name: "viewer_1", channelId: "channel-1" },
        message: [{ text: "gg wp" }],
      }),
    );

    expect(chatItems.value).toEqual([
      {
        platform: "youtube-live",
        id: "youtube-live-abc-123",
        nickname: "viewer_1",
        message: "gg wp",
        timestamp: expect.any(Number),
        extra: { emojis: {}, badges: {} },
      },
    ]);
  });

  describe("text + emoji reconstruction (youtubeLiveChatText / handleYoutubeLiveEmojis)", () => {
    it("concatenates text parts and emoji placeholders into the message, and maps each emoji placeholder to its url", async () => {
      setUp({ youtubeHandle: "@somechannel" });
      const { chatItems } = useYoutubeLive({});
      await flushInitChat();

      emitChat(
        baseYoutubeChatItem({
          message: [
            { text: "so good " },
            {
              url: "https://example.com/emoji.png",
              alt: ":emoji:",
              emojiText: ":emoji:",
              isCustomEmoji: true,
            },
            { text: " right?" },
          ],
        }),
      );

      expect(chatItems.value[0].message).toBe("so good {:emoji:} right?");
      expect(chatItems.value[0].extra.emojis).toEqual({
        "{:emoji:}": "https://example.com/emoji.png",
      });
    });

    it("produces plain text with no emojis when the message has no emoji parts", async () => {
      setUp({ youtubeHandle: "@somechannel" });
      const { chatItems } = useYoutubeLive({});
      await flushInitChat();

      emitChat(baseYoutubeChatItem({ message: [{ text: "plain message" }] }));

      expect(chatItems.value[0].message).toBe("plain message");
      expect(chatItems.value[0].extra.emojis).toEqual({});
    });
  });

  describe("handleYoutubeLiveBadges", () => {
    it("maps author.badge to a youtube-live/badge entry when present", async () => {
      setUp({ youtubeHandle: "@somechannel" });
      const { chatItems } = useYoutubeLive({});
      await flushInitChat();

      emitChat(
        baseYoutubeChatItem({
          author: {
            name: "viewer_1",
            channelId: "channel-1",
            badge: {
              thumbnail: {
                url: "https://example.com/badge.png",
                alt: "Member",
              },
              label: "Member (1 year)",
            },
          },
        }),
      );

      expect(chatItems.value[0].extra.badges).toEqual({
        "youtube-live/badge": "https://example.com/badge.png",
      });
    });

    it("produces no badges when author.badge is absent", async () => {
      setUp({ youtubeHandle: "@somechannel" });
      const { chatItems } = useYoutubeLive({});
      await flushInitChat();

      emitChat(baseYoutubeChatItem({}));

      expect(chatItems.value[0].extra.badges).toEqual({});
    });
  });

  describe("maxChatSize trimming", () => {
    it("keeps only the newest maxChatSize messages", async () => {
      setUp({ youtubeHandle: "@somechannel", maxChatSize: "2" });
      const { chatItems } = useYoutubeLive({});
      await flushInitChat();

      emitChat(baseYoutubeChatItem({ id: "m1" }));
      emitChat(baseYoutubeChatItem({ id: "m2" }));
      emitChat(baseYoutubeChatItem({ id: "m3" }));

      expect(chatItems.value.map((c) => c.id)).toEqual([
        "youtube-live-m2",
        "youtube-live-m3",
      ]);
    });

    it("does not trim when maxChatSize is undefined", async () => {
      setUp({ youtubeHandle: "@somechannel" });
      const { chatItems } = useYoutubeLive({});
      await flushInitChat();

      emitChat(baseYoutubeChatItem({ id: "m1" }));
      emitChat(baseYoutubeChatItem({ id: "m2" }));
      emitChat(baseYoutubeChatItem({ id: "m3" }));

      expect(chatItems.value).toHaveLength(3);
    });
  });

  describe("onBroadcasterMessage interception", () => {
    it("offers a message from the channel owner (isOwner) to the callback, as reconstructed text", async () => {
      setUp({ youtubeHandle: "@somechannel" });
      const onBroadcasterMessage = vi.fn(() => false);
      useYoutubeLive({ onBroadcasterMessage });
      await flushInitChat();

      emitChat(
        baseYoutubeChatItem({
          isOwner: true,
          message: [{ text: "broadcaster says hi" }],
        }),
      );

      expect(onBroadcasterMessage).toHaveBeenCalledWith("broadcaster says hi");
    });

    it("reconstructs an emoji-only broadcaster message using each part's alt text (youtubeLiveChatText's emoji branch)", async () => {
      setUp({ youtubeHandle: "@somechannel" });
      const onBroadcasterMessage = vi.fn(() => false);
      useYoutubeLive({ onBroadcasterMessage });
      await flushInitChat();

      emitChat(
        baseYoutubeChatItem({
          isOwner: true,
          message: [
            { text: "so good " },
            {
              url: "https://example.com/emoji.png",
              alt: ":emoji:",
              emojiText: ":emoji:",
              isCustomEmoji: true,
            },
          ],
        }),
      );

      expect(onBroadcasterMessage).toHaveBeenCalledWith("so good :emoji:");
    });

    it("does not push the message into chatItems when the callback returns true", async () => {
      setUp({ youtubeHandle: "@somechannel" });
      const onBroadcasterMessage = vi.fn(() => true);
      const { chatItems } = useYoutubeLive({ onBroadcasterMessage });
      await flushInitChat();

      emitChat(baseYoutubeChatItem({ isOwner: true }));

      expect(chatItems.value).toHaveLength(0);
    });

    it("does not invoke the callback for a message from a regular viewer", async () => {
      setUp({ youtubeHandle: "@somechannel" });
      const onBroadcasterMessage = vi.fn(() => true);
      const { chatItems } = useYoutubeLive({ onBroadcasterMessage });
      await flushInitChat();

      emitChat(baseYoutubeChatItem({ isOwner: false }));

      expect(onBroadcasterMessage).not.toHaveBeenCalled();
      expect(chatItems.value).toHaveLength(1);
    });
  });

  describe("clearChat", () => {
    it("empties the chat list", async () => {
      setUp({ youtubeHandle: "@somechannel" });
      const { chatItems, clearChat } = useYoutubeLive({});
      await flushInitChat();

      emitChat(baseYoutubeChatItem({}));
      expect(chatItems.value).toHaveLength(1);

      clearChat();
      expect(chatItems.value).toHaveLength(0);
    });
  });

  describe("initChat guards and reconnection", () => {
    it("does not construct/start a LiveChat client when youtubeHandle is unset", async () => {
      setUp();
      useYoutubeLive({});
      await flushInitChat();

      expect(mockLiveChat.start).not.toHaveBeenCalled();
    });

    it("removes listeners and stops the previous client before reconnecting when youtubeHandle changes", async () => {
      setUp({ youtubeHandle: "@first_channel" });
      const reactiveQuery = reactive<LocationQuery>({
        youtubeHandle: "@first_channel",
      });
      vi.mocked(useRoute).mockReturnValue(
        fakeRoute(reactiveQuery as LocationQuery),
      );

      useYoutubeLive({});
      await flushInitChat();
      expect(mockLiveChat.start).toHaveBeenCalledTimes(1);

      mockLiveChat.removeAllListeners.mockClear();
      mockLiveChat.stop.mockClear();
      reactiveQuery.youtubeHandle = "@second_channel";
      await flushInitChat();

      expect(mockLiveChat.removeAllListeners).toHaveBeenCalledTimes(1);
      expect(mockLiveChat.stop).toHaveBeenCalledTimes(1);
      expect(mockLiveChat.start).toHaveBeenCalledTimes(2);
    });

    it("reconnects ~1s after the LiveChat client reports 'end'", async () => {
      vi.useFakeTimers();
      try {
        setUp({ youtubeHandle: "@somechannel" });
        useYoutubeLive({});
        await vi.advanceTimersByTimeAsync(0);
        expect(mockLiveChat.start).toHaveBeenCalledTimes(1);

        mockLiveChat.handlers["end"]("some reason");

        await vi.advanceTimersByTimeAsync(999);
        expect(mockLiveChat.start).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1);
        expect(mockLiveChat.start).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("retries ~1s later when start() resolves false (failed to start)", async () => {
      vi.useFakeTimers();
      try {
        setUp({ youtubeHandle: "@somechannel" });
        mockLiveChat.start.mockResolvedValueOnce(false);
        useYoutubeLive({});
        await vi.advanceTimersByTimeAsync(0);
        expect(mockLiveChat.start).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(999);
        expect(mockLiveChat.start).toHaveBeenCalledTimes(1);

        mockLiveChat.start.mockResolvedValue(true);
        await vi.advanceTimersByTimeAsync(1);
        expect(mockLiveChat.start).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("teardown (onBeforeUnmount)", () => {
    it("stops the LiveChat client when the owning component unmounts", async () => {
      setUp({ youtubeHandle: "@somechannel" });
      const TestHost = defineComponent({
        setup() {
          useYoutubeLive({});
          return () => null;
        },
      });
      const wrapper = await mountSuspended(TestHost);
      await flushInitChat();
      mockLiveChat.stop.mockClear();

      await wrapper.unmount();

      expect(mockLiveChat.stop).toHaveBeenCalledTimes(1);
    });
  });
});
