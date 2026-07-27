import { createPinia, setActivePinia } from "pinia";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { defineComponent, reactive } from "vue";
import type { LocationQuery, RouteLocationNormalizedLoaded } from "vue-router";
import type { ChatUserstate } from "tmi.js";

// `useTwitch` wraps `tmi.js`'s `Client`, mocked out completely here (a fake
// client whose `on(event, handler)` registrations are captured so tests can
// invoke them directly, the same way the real library would). `tmi-utils`'s
// `parseEmotesInMessage`/`getEmoteAsUrl` are left real -- they're pure,
// deterministic, and exercising them for real is what makes the emoji-mapping
// tests below meaningful rather than just re-asserting a mock was called.
//
// What's under test: message normalisation into a ChatItem
// (handleTwitchEmojis/handleTwitchBadges), maxChatSize trimming,
// broadcaster-message interception, and the clearchat/messagedeleted/ban
// event handlers that mutate the message list in ways specific to Twitch.
// tmi.js's own reconnect logic and the `initChat` "remove previous chat
// client" dance are thin wiring and are not exercised here.

function fakeRoute(query: LocationQuery): RouteLocationNormalizedLoaded {
  return { query } as unknown as RouteLocationNormalizedLoaded;
}

mockNuxtImport("useRoute", () => {
  return vi.fn(() => fakeRoute({}));
});

type TmiHandler = (...args: unknown[]) => void;

const { mockClient, fetchMock } = vi.hoisted(() => {
  const handlers: Record<string, TmiHandler> = {};
  const client = {
    handlers,
    on: vi.fn((event: string, handler: TmiHandler) => {
      handlers[event] = handler;
      return client;
    }),
    connect: vi.fn(async () => [] as unknown),
    disconnect: vi.fn(async () => {}),
    removeAllListeners: vi.fn(),
    readyState: vi.fn(() => "OPEN"),
  };
  return { mockClient: client, fetchMock: vi.fn() };
});

vi.mock("tmi.js", () => ({
  // Must be a real function (not an arrow function) so `new Client(...)`
  // (used by useTwitch.ts's initChat) is a valid construct call.
  Client: vi.fn(function Client() {
    return mockClient;
  }),
}));

function setUp(query: LocationQuery = {}) {
  vi.stubGlobal("$fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ status: "OK", badge: {} });
  setActivePinia(createPinia());
  vi.mocked(useRoute).mockReturnValue(fakeRoute(query));
  mockClient.on.mockClear();
  mockClient.connect.mockClear();
  mockClient.disconnect.mockClear();
  mockClient.removeAllListeners.mockClear();
  // Reset to no-ops rather than `delete`-ing keys (dynamic `delete` is
  // lint-disallowed); each test's `initChat()` re-registers real handlers
  // via `on()` before anything dispatches to them.
  for (const key of Object.keys(mockClient.handlers)) {
    mockClient.handlers[key] = () => {};
  }
}

// Wait for `initChat`'s async chain (new Client -> connect() -> $fetch
// badges) to settle, since the `watch(..., { immediate: true })` that
// triggers it isn't awaited by useTwitch() itself.
async function flushInitChat() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function baseTags(overrides: Partial<ChatUserstate> = {}): ChatUserstate {
  return {
    id: "msg-1",
    "display-name": "some_viewer",
    "user-id": "user-1",
    ...overrides,
  } as ChatUserstate;
}

function emitMessage(
  tags: ChatUserstate,
  message: string,
  channel = "#somechannel",
  self = false,
) {
  mockClient.handlers["message"](channel, tags, message, self);
}

describe("useTwitch", () => {
  it("normalises a chat message into a ChatItem with the expected shape", async () => {
    setUp({ twitchChannel: "somechannel" });
    const { chatItems } = useTwitch({});
    await flushInitChat();

    emitMessage(
      baseTags({ id: "abc-123", "display-name": "viewer_1" }),
      "gg wp",
    );

    expect(chatItems.value).toEqual([
      {
        platform: "twitch",
        id: "twitch-abc-123",
        nickname: "viewer_1",
        message: "gg wp",
        timestamp: expect.any(Number),
        extra: { emojis: {}, badges: {} },
      },
    ]);
  });

  describe("handleTwitchEmojis", () => {
    it("maps each emote occurrence's raw text to its CDN url via tmi-utils", async () => {
      setUp({ twitchChannel: "somechannel" });
      const { chatItems } = useTwitch({});
      await flushInitChat();

      emitMessage(
        baseTags({ emotes: { "25": ["0-4", "11-15"] } }),
        "Kappa test Kappa",
      );

      expect(chatItems.value[0].extra.emojis).toEqual({
        Kappa: "https://static-cdn.jtvnw.net/emoticons/v2/25/default/light/2.0",
      });
    });

    it("produces no emojis when the message has no emotes", async () => {
      setUp({ twitchChannel: "somechannel" });
      const { chatItems } = useTwitch({});
      await flushInitChat();

      emitMessage(baseTags(), "plain text, no emotes here");

      expect(chatItems.value[0].extra.emojis).toEqual({});
    });
  });

  describe("handleTwitchBadges", () => {
    it("maps each badge/version pair to a twitch/<badge>/<version> key using fetched badge urls", async () => {
      setUp({ twitchChannel: "somechannel" });
      fetchMock.mockResolvedValue({
        status: "OK",
        badge: { "subscriber/12": "https://example.com/sub12.png" },
      });
      const { chatItems } = useTwitch({});
      await flushInitChat();

      emitMessage(
        baseTags({ badges: { subscriber: "12", premium: "1" } }),
        "hi",
      );

      expect(chatItems.value[0].extra.badges).toEqual({
        "twitch/subscriber/12": "https://example.com/sub12.png",
        // "premium/1" was never in the fetched badge map -> falls back to "".
        "twitch/premium/1": "",
      });
    });

    it("produces no badges when tags.badges is absent", async () => {
      setUp({ twitchChannel: "somechannel" });
      const { chatItems } = useTwitch({});
      await flushInitChat();

      emitMessage(baseTags({ badges: undefined }), "hi");

      expect(chatItems.value[0].extra.badges).toEqual({});
    });
  });

  describe("maxChatSize trimming", () => {
    it("keeps only the newest maxChatSize messages", async () => {
      setUp({ twitchChannel: "somechannel", maxChatSize: "2" });
      const { chatItems } = useTwitch({});
      await flushInitChat();

      emitMessage(baseTags({ id: "m1" }), "one");
      emitMessage(baseTags({ id: "m2" }), "two");
      emitMessage(baseTags({ id: "m3" }), "three");

      expect(chatItems.value.map((c) => c.id)).toEqual([
        "twitch-m2",
        "twitch-m3",
      ]);
    });

    it("does not trim when maxChatSize is undefined", async () => {
      setUp({ twitchChannel: "somechannel" });
      const { chatItems } = useTwitch({});
      await flushInitChat();

      emitMessage(baseTags({ id: "m1" }), "one");
      emitMessage(baseTags({ id: "m2" }), "two");
      emitMessage(baseTags({ id: "m3" }), "three");

      expect(chatItems.value).toHaveLength(3);
    });
  });

  describe("onBroadcasterMessage interception", () => {
    it("offers a message tagged with badges.broadcaster === '1' to the callback", async () => {
      setUp({ twitchChannel: "somechannel" });
      const onBroadcasterMessage = vi.fn(() => false);
      useTwitch({ onBroadcasterMessage });
      await flushInitChat();

      emitMessage(
        baseTags({ badges: { broadcaster: "1" } }),
        "broadcaster says hi",
      );

      expect(onBroadcasterMessage).toHaveBeenCalledWith("broadcaster says hi");
    });

    it("does not push the message into chatItems when the callback returns true", async () => {
      setUp({ twitchChannel: "somechannel" });
      const onBroadcasterMessage = vi.fn(() => true);
      const { chatItems } = useTwitch({ onBroadcasterMessage });
      await flushInitChat();

      emitMessage(baseTags({ badges: { broadcaster: "1" } }), "hi");

      expect(chatItems.value).toHaveLength(0);
    });

    it("does not invoke the callback for a message from a regular viewer", async () => {
      setUp({ twitchChannel: "somechannel" });
      const onBroadcasterMessage = vi.fn(() => true);
      const { chatItems } = useTwitch({ onBroadcasterMessage });
      await flushInitChat();

      emitMessage(baseTags({ badges: { subscriber: "1" } }), "hi");

      expect(onBroadcasterMessage).not.toHaveBeenCalled();
      expect(chatItems.value).toHaveLength(1);
    });
  });

  describe("clearchat event", () => {
    it("empties the message list", async () => {
      setUp({ twitchChannel: "somechannel" });
      const { chatItems } = useTwitch({});
      await flushInitChat();

      emitMessage(baseTags(), "hi");
      expect(chatItems.value).toHaveLength(1);

      mockClient.handlers["clearchat"]("#somechannel");
      expect(chatItems.value).toHaveLength(0);
    });
  });

  describe("messagedeleted event", () => {
    it("removes only the message whose tags.id matches the deleted target", async () => {
      setUp({ twitchChannel: "somechannel" });
      const { chatItems } = useTwitch({});
      await flushInitChat();

      emitMessage(baseTags({ id: "keep" }), "keep me");
      emitMessage(baseTags({ id: "delete-me" }), "delete me");

      mockClient.handlers["messagedeleted"](
        "#somechannel",
        "some_viewer",
        "delete me",
        { "target-msg-id": "delete-me" },
      );

      expect(chatItems.value.map((c) => c.id)).toEqual(["twitch-keep"]);
    });
  });

  describe("ban event", () => {
    it("removes all messages whose tags['user-id'] matches the banned user", async () => {
      setUp({ twitchChannel: "somechannel" });
      const { chatItems } = useTwitch({});
      await flushInitChat();

      emitMessage(baseTags({ id: "m1", "user-id": "banned-user" }), "one");
      emitMessage(baseTags({ id: "m2", "user-id": "other-user" }), "two");

      mockClient.handlers["ban"]("#somechannel", "baduser", "reason", {
        "target-user-id": "banned-user",
      });

      expect(chatItems.value.map((c) => c.id)).toEqual(["twitch-m2"]);
    });
  });

  describe("clearChat", () => {
    it("empties the chat list", async () => {
      setUp({ twitchChannel: "somechannel" });
      const { chatItems, clearChat } = useTwitch({});
      await flushInitChat();

      emitMessage(baseTags(), "hi");
      expect(chatItems.value).toHaveLength(1);

      clearChat();
      expect(chatItems.value).toHaveLength(0);
    });
  });

  describe("initChat guards and reconnection", () => {
    it("does not construct/connect a tmi.js client when twitchChannel is unset", async () => {
      setUp();
      useTwitch({});
      await flushInitChat();

      expect(mockClient.connect).not.toHaveBeenCalled();
    });

    it("removes listeners and disconnects the previous client before reconnecting when twitchChannel changes", async () => {
      setUp({ twitchChannel: "first_channel" });
      const reactiveQuery = reactive<LocationQuery>({
        twitchChannel: "first_channel",
      });
      vi.mocked(useRoute).mockReturnValue(
        fakeRoute(reactiveQuery as LocationQuery),
      );

      useTwitch({});
      await flushInitChat();
      expect(mockClient.connect).toHaveBeenCalledTimes(1);

      mockClient.removeAllListeners.mockClear();
      mockClient.disconnect.mockClear();
      reactiveQuery.twitchChannel = "second_channel";
      await flushInitChat();

      expect(mockClient.removeAllListeners).toHaveBeenCalledTimes(1);
      expect(mockClient.disconnect).toHaveBeenCalledTimes(1);
      expect(mockClient.connect).toHaveBeenCalledTimes(2);
    });

    it("reconnects ~1s after tmi.js reports 'disconnected'", async () => {
      vi.useFakeTimers();
      try {
        setUp({ twitchChannel: "somechannel" });
        useTwitch({});
        await vi.advanceTimersByTimeAsync(0);
        expect(mockClient.connect).toHaveBeenCalledTimes(1);

        mockClient.handlers["disconnected"]("some reason");

        await vi.advanceTimersByTimeAsync(999);
        expect(mockClient.connect).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1);
        expect(mockClient.connect).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("badge fetch failure", () => {
    it("leaves badgeData empty (badges fall back to '') when the badges fetch returns a non-OK status", async () => {
      setUp({ twitchChannel: "somechannel" });
      fetchMock.mockResolvedValue({ status: "ERROR", code: "x", error: "x" });
      const { chatItems } = useTwitch({});
      await flushInitChat();

      emitMessage(baseTags({ badges: { subscriber: "12" } }), "hi");

      expect(chatItems.value[0].extra.badges).toEqual({
        "twitch/subscriber/12": "",
      });
    });
  });

  describe("teardown (onBeforeUnmount)", () => {
    it("disconnects the tmi.js client when the owning component unmounts", async () => {
      setUp({ twitchChannel: "somechannel" });
      const TestHost = defineComponent({
        setup() {
          useTwitch({});
          return () => null;
        },
      });
      const wrapper = await mountSuspended(TestHost);
      await flushInitChat();
      mockClient.disconnect.mockClear();

      await wrapper.unmount();

      expect(mockClient.disconnect).toHaveBeenCalledTimes(1);
    });
  });
});
