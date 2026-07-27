import { createPinia, setActivePinia } from "pinia";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { defineComponent, nextTick, type Ref } from "vue";
import type { LocationQuery, RouteLocationNormalizedLoaded } from "vue-router";
import { useWebSocket } from "@vueuse/core";

// `useKick` talks to Pusher over a raw WebSocket via `useWebSocket` from
// `@vueuse/core`, and polls the chatroom id via `useTimeoutPoll`. Both are
// mocked out completely -- what's under test is useKick's OWN logic: turning
// a Pusher `App\Events\ChatMessageEvent` payload into a ChatItem
// (handleKickEmojis/handleKickBadges), maxChatSize trimming, and
// broadcaster-message interception. Reconnect/heartbeat timer mechanics are
// thin wiring over vueuse and are intentionally not exercised here.

function fakeRoute(query: LocationQuery): RouteLocationNormalizedLoaded {
  return { query } as unknown as RouteLocationNormalizedLoaded;
}

mockNuxtImport("useRoute", () => {
  return vi.fn(() => fakeRoute({}));
});

const {
  webSocketSendMock,
  webSocketOpenMock,
  webSocketCloseMock,
  useTimeoutPollMock,
  fetchMock,
  refsHolder,
} = vi.hoisted(() => {
  return {
    webSocketSendMock: vi.fn(),
    webSocketOpenMock: vi.fn(),
    webSocketCloseMock: vi.fn(),
    useTimeoutPollMock: vi.fn(),
    fetchMock: vi.fn(),
    // `ref()` itself can't be called from inside `vi.hoisted` (the "vue"
    // import isn't initialised yet at hoist time), so this holder is filled
    // in lazily by the `@vueuse/core` mock factory below -- which *is* safe,
    // since factories run when the mocked module is actually resolved,
    // well after the test file's own imports have settled.
    refsHolder: {} as {
      webSocketData: Ref<string | null>;
      webSocketStatus: Ref<string>;
    },
  };
});

vi.mock("@vueuse/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vueuse/core")>();
  const { ref } = await import("vue");
  refsHolder.webSocketData = ref<string | null>(null);
  refsHolder.webSocketStatus = ref("CLOSED");
  return {
    ...actual,
    useWebSocket: vi.fn(() => ({
      status: refsHolder.webSocketStatus,
      data: refsHolder.webSocketData,
      send: webSocketSendMock,
      open: webSocketOpenMock,
      close: webSocketCloseMock,
    })),
    // Never auto-fires the polled function by default -- tests that need
    // updateKickChatroomId's effect (populating subscriberBadges) invoke the
    // captured callback explicitly.
    useTimeoutPoll: vi.fn((fn: () => void | Promise<void>, ...rest: []) => {
      useTimeoutPollMock(fn, ...rest);
      return { pause: vi.fn(), resume: vi.fn(), isActive: ref(false) };
    }),
  };
});

function setUp(query: LocationQuery = {}) {
  vi.stubGlobal("$fetch", fetchMock);
  setActivePinia(createPinia());
  vi.mocked(useRoute).mockReturnValue(fakeRoute(query));
  refsHolder.webSocketData.value = null;
  refsHolder.webSocketStatus.value = "CLOSED";
  webSocketSendMock.mockClear();
  webSocketOpenMock.mockClear();
  webSocketCloseMock.mockClear();
  useTimeoutPollMock.mockClear();
  fetchMock.mockReset();
}

function pusherEnvelope(event: string, data: unknown) {
  return JSON.stringify({ event, data: JSON.stringify(data) });
}

function baseChatEventData(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    chatroom_id: 1,
    content: "hello",
    type: "message",
    created_at: "2026-01-01T00:00:00Z",
    sender: {
      id: 1,
      username: "some_viewer",
      slug: "some_viewer",
      identity: {
        color: "#fff",
        badges: [],
      },
    },
    ...overrides,
  };
}

async function emitChatMessage(data: Record<string, unknown>) {
  refsHolder.webSocketData.value = pusherEnvelope(
    "App\\Events\\ChatMessageEvent",
    data,
  );
  await nextTick();
}

describe("useKick", () => {
  it("normalises a chat message into a ChatItem with the expected shape", async () => {
    setUp();
    const { chatItems } = useKick({});

    await emitChatMessage(
      baseChatEventData({
        id: "abc-123",
        content: "gg wp",
        sender: {
          id: 1,
          username: "viewer_1",
          slug: "viewer_1",
          identity: { color: "#fff", badges: [] },
        },
      }),
    );

    expect(chatItems.value).toEqual([
      {
        platform: "kick",
        id: "kick-abc-123",
        nickname: "viewer_1",
        message: "gg wp",
        timestamp: expect.any(Number),
        extra: { emojis: {}, badges: {} },
      },
    ]);
  });

  describe("handleKickEmojis", () => {
    it("extracts [emote:id:name] tokens into a {token: url} map", async () => {
      setUp();
      const { chatItems } = useKick({});

      await emitChatMessage(
        baseChatEventData({
          content: "hello [emote:39625:heyyy] world [emote:5:Kappa]",
        }),
      );

      expect(chatItems.value[0].extra.emojis).toEqual({
        "[emote:39625:heyyy]": "https://files.kick.com/emotes/39625/fullsize",
        "[emote:5:Kappa]": "https://files.kick.com/emotes/5/fullsize",
      });
    });

    it("returns no emojis when the message has no emote tokens", async () => {
      setUp();
      const { chatItems } = useKick({});

      await emitChatMessage(baseChatEventData({ content: "plain text" }));

      expect(chatItems.value[0].extra.emojis).toEqual({});
    });
  });

  describe("handleKickBadges", () => {
    it.each([
      ["broadcaster", "kick/broadcaster", "/badges/kick/broadcaster.svg"],
      ["moderator", "kick/moderator", "/badges/kick/moderator.svg"],
      ["verified", "kick/verified", "/badges/kick/verified.svg"],
      ["founder", "kick/founder", "/badges/kick/founder.svg"],
      ["og", "kick/og", "/badges/kick/og.svg"],
      ["vip", "kick/vip", "/badges/kick/vip.svg"],
    ])("maps badge type %s to %s", async (type, key, url) => {
      setUp();
      const { chatItems } = useKick({});

      await emitChatMessage(
        baseChatEventData({
          sender: {
            id: 1,
            username: "viewer_1",
            slug: "viewer_1",
            identity: { color: "#fff", badges: [{ type, text: type }] },
          },
        }),
      );

      expect(chatItems.value[0].extra.badges).toEqual({ [key]: url });
    });

    it("does not map staff or sub_gifter badges (not implemented yet)", async () => {
      setUp();
      const { chatItems } = useKick({});

      await emitChatMessage(
        baseChatEventData({
          sender: {
            id: 1,
            username: "viewer_1",
            slug: "viewer_1",
            identity: {
              color: "#fff",
              badges: [
                { type: "staff", text: "staff" },
                { type: "sub_gifter", text: "sub_gifter", count: 1 },
              ],
            },
          },
        }),
      );

      expect(chatItems.value[0].extra.badges).toEqual({});
    });

    it("picks the highest subscriber-months badge the viewer qualifies for", async () => {
      setUp({ kickChannel: "test-channel" });
      fetchMock.mockResolvedValue({
        chatroom: { id: 42 },
        subscriber_badges: [
          {
            id: 1,
            channel_id: 1,
            months: 1,
            badge_image: { srcset: "", src: "https://example.com/1.png" },
          },
          {
            id: 2,
            channel_id: 1,
            months: 3,
            badge_image: { srcset: "", src: "https://example.com/3.png" },
          },
          {
            id: 3,
            channel_id: 1,
            months: 6,
            badge_image: { srcset: "", src: "https://example.com/6.png" },
          },
        ],
      });
      const { chatItems } = useKick({});
      // Manually fire the (mocked, non-auto-invoking) chatroom-id poll so
      // subscriberBadges gets populated, same as vueuse's immediate:true
      // would in the real composable.
      await useTimeoutPollMock.mock.calls[0][0]();

      await emitChatMessage(
        baseChatEventData({
          sender: {
            id: 1,
            username: "viewer_1",
            slug: "viewer_1",
            identity: {
              color: "#fff",
              badges: [{ type: "subscriber", text: "subscriber", count: 4 }],
            },
          },
        }),
      );

      // 4 months qualifies for the "1" and "3" tiers but not "6"; the
      // highest qualifying tier (3) should win.
      expect(chatItems.value[0].extra.badges).toEqual({
        "kick/subscriber/3": "https://example.com/3.png",
      });
    });

    it("maps no subscriber badge when the viewer doesn't meet any threshold", async () => {
      setUp({ kickChannel: "test-channel" });
      fetchMock.mockResolvedValue({
        chatroom: { id: 42 },
        subscriber_badges: [
          {
            id: 1,
            channel_id: 1,
            months: 3,
            badge_image: { srcset: "", src: "https://example.com/3.png" },
          },
        ],
      });
      const { chatItems } = useKick({});
      await useTimeoutPollMock.mock.calls[0][0]();

      await emitChatMessage(
        baseChatEventData({
          sender: {
            id: 1,
            username: "viewer_1",
            slug: "viewer_1",
            identity: {
              color: "#fff",
              badges: [{ type: "subscriber", text: "subscriber", count: 1 }],
            },
          },
        }),
      );

      expect(chatItems.value[0].extra.badges).toEqual({});
    });
  });

  describe("subscribing to the pusher channel", () => {
    it("subscribes to the chatrooms.<id>.v2 channel on pusher:connection_established", async () => {
      setUp({ kickChannel: "test-channel" });
      fetchMock.mockResolvedValue({
        chatroom: { id: 777 },
        subscriber_badges: [],
      });
      useKick({});
      await useTimeoutPollMock.mock.calls[0][0]();

      refsHolder.webSocketData.value = JSON.stringify({
        event: "pusher:connection_established",
        data: "{}",
      });
      await nextTick();

      expect(webSocketSendMock).toHaveBeenCalledWith(
        expect.stringContaining('"channel":"chatrooms.777.v2"'),
      );
    });
  });

  describe("pusher websocket URL", () => {
    it("connects with Kick's current Pusher app key/cluster/client version", () => {
      setUp();
      useKick({});

      const url = vi.mocked(useWebSocket).mock.calls.at(-1)![0] as string;
      expect(url).toBe(
        "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.5.0&flash=false",
      );
    });
  });

  describe("pusher:error handling", () => {
    function pusherErrorEnvelope(code: number, message: string) {
      return JSON.stringify({
        event: "pusher:error",
        data: JSON.stringify({ code, message }),
      });
    }

    it("logs a fatal (4000-4099) pusher:error, stops reconnection, and pushes exactly one ChatPlatformError", async () => {
      setUp();
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const { errors } = useKick({});

      refsHolder.webSocketData.value = pusherErrorEnvelope(
        4001,
        "App key eb1d5f283081a78b932c not in this cluster. Did you forget to specify the cluster?",
      );
      await nextTick();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("4001"),
      );
      // Closing the socket explicitly is what stops useWebSocket's
      // autoReconnect from firing again (it only reconnects when the socket
      // was not explicitly closed).
      expect(webSocketCloseMock).toHaveBeenCalled();
      expect(errors.value).toHaveLength(1);
      expect(errors.value[0]).toMatchObject({
        id: "kick-pusher-error",
        platform: "kick",
      });

      // The error is actionable: clicking it reloads the page.
      const reloadSpy = vi.fn();
      vi.stubGlobal("location", { reload: reloadSpy });
      errors.value[0].onClick?.();
      expect(reloadSpy).toHaveBeenCalledTimes(1);
      vi.unstubAllGlobals();

      // A second fatal error must not push a duplicate. Reset to `null`
      // first so the ref actually changes (assigning the identical string
      // again wouldn't trigger the watcher a second time).
      webSocketCloseMock.mockClear();
      refsHolder.webSocketData.value = null;
      await nextTick();
      refsHolder.webSocketData.value = pusherErrorEnvelope(
        4001,
        "App key eb1d5f283081a78b932c not in this cluster. Did you forget to specify the cluster?",
      );
      await nextTick();

      expect(errors.value).toHaveLength(1);

      consoleErrorSpy.mockRestore();
    });

    it("still allows a successful pusher:connection_established to subscribe to chatrooms.<id>.v2 (regression guard for the URL/version change)", async () => {
      setUp({ kickChannel: "test-channel" });
      fetchMock.mockResolvedValue({
        chatroom: { id: 1220770 },
        subscriber_badges: [],
      });
      const { errors } = useKick({});
      await useTimeoutPollMock.mock.calls[0][0]();

      refsHolder.webSocketData.value = JSON.stringify({
        event: "pusher:connection_established",
        data: "{}",
      });
      await nextTick();

      expect(webSocketSendMock).toHaveBeenCalledWith(
        expect.stringContaining('"channel":"chatrooms.1220770.v2"'),
      );
      expect(errors.value).toHaveLength(0);
    });
  });

  describe("maxChatSize trimming", () => {
    it("keeps only the newest maxChatSize messages", async () => {
      setUp({ maxChatSize: "2" });
      const { chatItems } = useKick({});

      for (const id of ["m1", "m2", "m3"]) {
        await emitChatMessage(baseChatEventData({ id }));
      }

      expect(chatItems.value.map((c) => c.id)).toEqual(["kick-m2", "kick-m3"]);
    });

    it("does not trim when maxChatSize is undefined", async () => {
      setUp();
      const { chatItems } = useKick({});

      for (const id of ["m1", "m2", "m3"]) {
        await emitChatMessage(baseChatEventData({ id }));
      }

      expect(chatItems.value).toHaveLength(3);
    });
  });

  describe("onBroadcasterMessage interception", () => {
    it("offers a message from a sender with the broadcaster badge to the callback", async () => {
      setUp();
      const onBroadcasterMessage = vi.fn(() => false);
      useKick({ onBroadcasterMessage });

      await emitChatMessage(
        baseChatEventData({
          content: "broadcaster says hi",
          sender: {
            id: 1,
            username: "the_streamer",
            slug: "the_streamer",
            identity: {
              color: "#fff",
              badges: [{ type: "broadcaster", text: "broadcaster" }],
            },
          },
        }),
      );

      expect(onBroadcasterMessage).toHaveBeenCalledWith("broadcaster says hi");
    });

    it("does not push the message into chatItems when the callback returns true", async () => {
      setUp();
      const onBroadcasterMessage = vi.fn(() => true);
      const { chatItems } = useKick({ onBroadcasterMessage });

      await emitChatMessage(
        baseChatEventData({
          sender: {
            id: 1,
            username: "the_streamer",
            slug: "the_streamer",
            identity: {
              color: "#fff",
              badges: [{ type: "broadcaster", text: "broadcaster" }],
            },
          },
        }),
      );

      expect(chatItems.value).toHaveLength(0);
    });

    it("does not invoke the callback for a message from a regular viewer", async () => {
      setUp();
      const onBroadcasterMessage = vi.fn(() => true);
      const { chatItems } = useKick({ onBroadcasterMessage });

      await emitChatMessage(baseChatEventData({}));

      expect(onBroadcasterMessage).not.toHaveBeenCalled();
      expect(chatItems.value).toHaveLength(1);
    });
  });

  describe("clearChat", () => {
    it("empties the chat list", async () => {
      setUp();
      const { chatItems, clearChat } = useKick({});

      await emitChatMessage(baseChatEventData({}));
      expect(chatItems.value).toHaveLength(1);

      clearChat();
      expect(chatItems.value).toHaveLength(0);
    });
  });

  describe("updateKickChatroomId", () => {
    it("does not call the Kick API when kickChannel is unset", async () => {
      setUp();
      useKick({});

      await useTimeoutPollMock.mock.calls[0][0]();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("logs and recovers (does not throw, never opens the socket) when the channel-info fetch fails", async () => {
      setUp({ kickChannel: "test-channel" });
      fetchMock.mockRejectedValue(new Error("network down"));
      useKick({});

      await expect(
        useTimeoutPollMock.mock.calls[0][0](),
      ).resolves.toBeUndefined();

      // kickChatroomId was never set, so initChat's guard never opens a socket.
      expect(webSocketOpenMock).not.toHaveBeenCalled();
    });
  });

  describe("teardown (onBeforeUnmount)", () => {
    it("closes the websocket when the owning component unmounts", async () => {
      setUp();
      const TestHost = defineComponent({
        setup() {
          useKick({});
          return () => null;
        },
      });
      const wrapper = await mountSuspended(TestHost);
      webSocketCloseMock.mockClear();

      await wrapper.unmount();

      expect(webSocketCloseMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("reinitializing the websocket connection", () => {
    it("closes an already-open socket before reopening when kickChatroomId changes", async () => {
      setUp({ kickChannel: "test-channel" });
      fetchMock.mockResolvedValue({
        chatroom: { id: 42 },
        subscriber_badges: [],
      });
      useKick({});

      // Simulate a socket left open from a previous chatroom id.
      refsHolder.webSocketStatus.value = "OPEN";
      webSocketCloseMock.mockClear();
      webSocketOpenMock.mockClear();

      // Populates kickChatroomId, which the `initChat` watch depends on --
      // this re-triggers initChat() while the (fake) socket is still "OPEN".
      await useTimeoutPollMock.mock.calls[0][0]();

      expect(webSocketCloseMock).toHaveBeenCalledTimes(1);
      expect(webSocketOpenMock).toHaveBeenCalledTimes(1);
    });
  });
});
