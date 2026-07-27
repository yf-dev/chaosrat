import { createPinia, setActivePinia } from "pinia";
import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { effectScope, reactive, ref } from "vue";
import type { LocationQuery, RouteLocationNormalizedLoaded } from "vue-router";
import type {
  ChzzkConnectionDeps,
  ChzzkChatSessionMessage,
} from "~/lib/chzzkConnection";
import type { SharedConnectionOptions } from "~/composables/useSharedConnection";

// `useChzzk` wraps two real transports: `createChzzkConnection` (the
// socket.io session state machine, already covered end-to-end by
// test/unit/chzzkConnection.test.ts) and `useSharedConnection` (the
// BroadcastChannel leader-election wrapper, covered by
// test/unit/useSharedConnection.test.ts). Both are mocked out completely
// here -- what's under test is useChzzk's OWN logic: turning a
// ChzzkChatSessionMessage into a ChatItem (handleChzzkEmojis/handleChzzkBadges),
// maxChatSize trimming, broadcaster-message interception, and the
// login/ccid-mismatch error surfacing that connects onAuthRequired /
// checkAuth to the `errors` ref.
//
// Capturing the `deps` passed to createChzzkConnection and the `options`
// passed to useSharedConnection lets tests drive useChzzk's internal
// callbacks directly, exactly the way the real transports would.

function fakeRoute(query: LocationQuery): RouteLocationNormalizedLoaded {
  return { query } as unknown as RouteLocationNormalizedLoaded;
}

mockNuxtImport("useRoute", () => {
  return vi.fn(() => fakeRoute({}));
});

mockNuxtImport("useRequestURL", () => {
  return vi.fn(() => new URL("https://example.com/chat"));
});

const {
  capturedConnectionDeps,
  capturedSharedOptions,
  capturedConnection,
  useTimeoutPollMock,
  fetchMock,
} = vi.hoisted(() => {
  return {
    capturedConnectionDeps: { current: undefined as unknown },
    capturedSharedOptions: { current: undefined as unknown },
    capturedConnection: { current: undefined as unknown },
    useTimeoutPollMock: vi.fn(),
    fetchMock: vi.fn(),
  };
});

// `useChzzk` also polls `checkAuth` via `useTimeoutPoll(checkAuth, 60_000, {
// immediate: true })`. Never auto-fire it -- tests that need checkAuth's
// effect invoke the captured callback explicitly, with `$fetch` stubbed to
// control the /api/chzzk/me and /api/chzzk/auth/refresh responses.
vi.mock("@vueuse/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vueuse/core")>();
  return {
    ...actual,
    useTimeoutPoll: vi.fn((fn: () => void | Promise<void>, ...rest: []) => {
      useTimeoutPollMock(fn, ...rest);
      return { pause: vi.fn(), resume: vi.fn(), isActive: ref(false) };
    }),
  };
});

vi.mock("~/lib/chzzkConnection", () => ({
  createChzzkConnection: vi.fn((deps: ChzzkConnectionDeps) => {
    capturedConnectionDeps.current = deps;
    const connection = {
      start: vi.fn(),
      stop: vi.fn(async () => {}),
      isRunning: vi.fn(() => false),
    };
    capturedConnection.current = connection;
    return connection;
  }),
}));

vi.mock("~/composables/useSharedConnection", () => ({
  useSharedConnection: vi.fn((_channelName: unknown, options: unknown) => {
    capturedSharedOptions.current = options;
    return {
      sendData: vi.fn(),
      isLeader: ref(false),
      isClosed: ref(false),
      close: vi.fn(async () => {}),
    };
  }),
}));

function deps(): ChzzkConnectionDeps {
  return capturedConnectionDeps.current as ChzzkConnectionDeps;
}

function sharedOptions(): SharedConnectionOptions<unknown> {
  return capturedSharedOptions.current as SharedConnectionOptions<unknown>;
}

// `fetchLiveSignal`/`fetchSubscriptionHealth` are declared optional on
// ChzzkConnectionDeps (lib/chzzkConnection.ts uses `deps.fetchLiveSignal?.()`
// internally). The mock in this file always provides both, so these wrappers
// assert that -- surfacing a real "the dep was never wired up" failure -- and
// then call it, rather than papering over the possibly-undefined type with a
// bare `!` at every call site below.
function fetchLiveSignal(): ReturnType<
  NonNullable<ChzzkConnectionDeps["fetchLiveSignal"]>
> {
  const fn = deps().fetchLiveSignal;
  expect(fn).toBeDefined();
  return fn!();
}

function fetchSubscriptionHealth(
  sessionKey: string,
): ReturnType<NonNullable<ChzzkConnectionDeps["fetchSubscriptionHealth"]>> {
  const fn = deps().fetchSubscriptionHealth;
  expect(fn).toBeDefined();
  return fn!(sessionKey);
}

function emitData(
  data: Parameters<SharedConnectionOptions<unknown>["onData"]>[0],
) {
  sharedOptions().onData(data);
}

function baseChatMessage(
  overrides: Partial<ChzzkChatSessionMessage> = {},
): ChzzkChatSessionMessage {
  return {
    channelId: "channel-1",
    senderChannelId: "sender-1",
    profile: {
      nickname: "some_viewer",
      badges: [],
      verifiedMark: false,
    },
    content: "hello",
    emojis: {},
    messageTime: 1000,
    ...overrides,
  };
}

function setUp(query: LocationQuery = {}) {
  vi.stubGlobal("$fetch", fetchMock);
  fetchMock.mockReset();
  useTimeoutPollMock.mockClear();
  setActivePinia(createPinia());
  vi.mocked(useRoute).mockReturnValue(fakeRoute(query));
}

function checkAuth(): Promise<void> {
  return useTimeoutPollMock.mock.calls[
    useTimeoutPollMock.mock.calls.length - 1
  ][0]();
}

describe("useChzzk", () => {
  it("normalises a CHAT message into a ChatItem with the expected shape", () => {
    setUp();
    const { chatItems } = useChzzk({});

    emitData({
      type: "CHAT",
      message: baseChatMessage({
        messageTime: 12345,
        profile: { nickname: "viewer_1", badges: [], verifiedMark: false },
        content: "gg wp",
      }),
    });

    expect(chatItems.value).toEqual([
      {
        platform: "chzzk",
        id: "chzzk-12345",
        nickname: "viewer_1",
        message: "gg wp",
        timestamp: expect.any(Number),
        extra: { emojis: {}, badges: {} },
      },
    ]);
  });

  describe("handleChzzkEmojis", () => {
    it("turns a {id: url} emoji map into {'{:id:}': url}", () => {
      setUp();
      const { chatItems } = useChzzk({});

      emitData({
        type: "CHAT",
        message: baseChatMessage({
          emojis: { happy: "https://example.com/happy.png" },
        }),
      });

      expect(chatItems.value[0].extra.emojis).toEqual({
        "{:happy:}": "https://example.com/happy.png",
      });
    });

    it("treats emojis arriving as a string (not an object) as empty", () => {
      setUp();
      const { chatItems } = useChzzk({});

      emitData({
        type: "CHAT",
        // The real wire format shouldn't send a string here, but the code
        // has a defensive branch for it -- pin that it doesn't throw and
        // produces no emojis rather than iterating over string characters.
        message: baseChatMessage({
          emojis: "not-an-object" as unknown as { [key: string]: string },
        }),
      });

      expect(chatItems.value[0].extra.emojis).toEqual({});
    });
  });

  describe("handleChzzkBadges", () => {
    it("indexes badges as chzzk/0, chzzk/1, ... in order", () => {
      setUp();
      const { chatItems } = useChzzk({});

      emitData({
        type: "CHAT",
        message: baseChatMessage({
          profile: {
            nickname: "viewer_1",
            badges: [
              { imageUrl: "https://example.com/badge0.png" },
              { imageUrl: "https://example.com/badge1.png" },
            ],
            verifiedMark: false,
          },
        }),
      });

      expect(chatItems.value[0].extra.badges).toEqual({
        "chzzk/0": "https://example.com/badge0.png",
        "chzzk/1": "https://example.com/badge1.png",
      });
    });

    it("appends a verified mark badge when verifiedMark is true", () => {
      setUp();
      const { chatItems } = useChzzk({});

      emitData({
        type: "CHAT",
        message: baseChatMessage({
          profile: { nickname: "viewer_1", badges: [], verifiedMark: true },
        }),
      });

      expect(chatItems.value[0].extra.badges).toEqual({
        "chzzk/verified":
          "https://ssl.pstatic.net/static/nng/glive/icon/verified.png",
      });
    });

    it("does not add a verified badge when verifiedMark is false", () => {
      setUp();
      const { chatItems } = useChzzk({});

      emitData({
        type: "CHAT",
        message: baseChatMessage({
          profile: { nickname: "viewer_1", badges: [], verifiedMark: false },
        }),
      });

      expect(chatItems.value[0].extra.badges).toEqual({});
    });
  });

  describe("maxChatSize trimming", () => {
    it("keeps only the newest maxChatSize messages", () => {
      setUp({ maxChatSize: "2" });
      const { chatItems } = useChzzk({});

      for (const time of [1, 2, 3]) {
        emitData({
          type: "CHAT",
          message: baseChatMessage({
            messageTime: time,
            content: `msg-${time}`,
          }),
        });
      }

      expect(chatItems.value.map((c) => c.id)).toEqual(["chzzk-2", "chzzk-3"]);
    });

    it("does not trim when maxChatSize is undefined", () => {
      setUp();
      const { chatItems } = useChzzk({});

      for (const time of [1, 2, 3]) {
        emitData({
          type: "CHAT",
          message: baseChatMessage({ messageTime: time }),
        });
      }

      expect(chatItems.value).toHaveLength(3);
    });
  });

  describe("onBroadcasterMessage interception", () => {
    it("offers a message from the broadcaster (senderChannelId === channelId) to the callback", () => {
      setUp();
      const onBroadcasterMessage = vi.fn(() => false);
      useChzzk({ onBroadcasterMessage });

      emitData({
        type: "CHAT",
        message: baseChatMessage({
          channelId: "chan-1",
          senderChannelId: "chan-1",
          content: "broadcaster says hi",
        }),
      });

      expect(onBroadcasterMessage).toHaveBeenCalledWith("broadcaster says hi");
    });

    it("does not push the message into chatItems when the callback returns true", () => {
      setUp();
      const onBroadcasterMessage = vi.fn(() => true);
      const { chatItems } = useChzzk({ onBroadcasterMessage });

      emitData({
        type: "CHAT",
        message: baseChatMessage({
          channelId: "chan-1",
          senderChannelId: "chan-1",
        }),
      });

      expect(chatItems.value).toHaveLength(0);
    });

    it("still pushes the message when the callback returns false", () => {
      setUp();
      const onBroadcasterMessage = vi.fn(() => false);
      const { chatItems } = useChzzk({ onBroadcasterMessage });

      emitData({
        type: "CHAT",
        message: baseChatMessage({
          channelId: "chan-1",
          senderChannelId: "chan-1",
        }),
      });

      expect(chatItems.value).toHaveLength(1);
    });

    it("does not invoke the callback for a message from a regular viewer", () => {
      setUp();
      const onBroadcasterMessage = vi.fn(() => true);
      const { chatItems } = useChzzk({ onBroadcasterMessage });

      emitData({
        type: "CHAT",
        message: baseChatMessage({
          channelId: "chan-1",
          senderChannelId: "someone-else",
        }),
      });

      expect(onBroadcasterMessage).not.toHaveBeenCalled();
      expect(chatItems.value).toHaveLength(1);
    });
  });

  describe("error surfacing via onAuthRequired", () => {
    it("adds a chzzk-login error when auth is required", () => {
      setUp();
      const { errors } = useChzzk({});

      deps().onAuthRequired(true);

      expect(errors.value).toHaveLength(1);
      expect(errors.value[0].id).toBe("chzzk-login");
      expect(errors.value[0].platform).toBe("chzzk");
    });

    it("does not add a duplicate chzzk-login error on repeated calls", () => {
      setUp();
      const { errors } = useChzzk({});

      deps().onAuthRequired(true);
      deps().onAuthRequired(true);
      deps().onAuthRequired(true);

      expect(errors.value.filter((e) => e.id === "chzzk-login")).toHaveLength(
        1,
      );
    });

    it("removes the chzzk-login error once auth is no longer required", () => {
      setUp();
      const { errors } = useChzzk({});

      deps().onAuthRequired(true);
      expect(errors.value).toHaveLength(1);

      deps().onAuthRequired(false);
      expect(errors.value).toHaveLength(0);
    });
  });

  describe("clearChat", () => {
    it("empties the chat list", () => {
      setUp();
      const { chatItems, clearChat } = useChzzk({});

      emitData({ type: "CHAT", message: baseChatMessage() });
      expect(chatItems.value).toHaveLength(1);

      clearChat();
      expect(chatItems.value).toHaveLength(0);
    });
  });

  describe("fetchSessionUrl (deps passed to createChzzkConnection)", () => {
    it("returns ERROR without calling $fetch when chzzkChannelId is unset", async () => {
      setUp();
      useChzzk({});

      const result = await deps().fetchSessionUrl();

      expect(result).toEqual({ status: "ERROR" });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns OK with the url on a successful response", async () => {
      setUp({ chzzkChannelId: "chan-1" });
      fetchMock.mockResolvedValue({ status: "OK", url: "wss://example.com" });
      useChzzk({});

      const result = await deps().fetchSessionUrl();

      expect(result).toEqual({ status: "OK", url: "wss://example.com" });
    });

    it.each(["not_logged_in", "unauthorized"])(
      "maps error code %s to UNAUTHORIZED",
      async (code) => {
        setUp({ chzzkChannelId: "chan-1" });
        fetchMock.mockResolvedValue({ status: "ERROR", code, error: "x" });
        useChzzk({});

        const result = await deps().fetchSessionUrl();

        expect(result).toEqual({ status: "UNAUTHORIZED" });
      },
    );

    it("maps any other error code to ERROR, passing the code through", async () => {
      setUp({ chzzkChannelId: "chan-1" });
      fetchMock.mockResolvedValue({
        status: "ERROR",
        code: "some_other_error",
        error: "x",
      });
      useChzzk({});

      const result = await deps().fetchSessionUrl();

      expect(result).toEqual({ status: "ERROR", code: "some_other_error" });
    });
  });

  describe("refreshToken (deps passed to createChzzkConnection)", () => {
    it("returns true on an OK response", async () => {
      setUp();
      fetchMock.mockResolvedValue({ status: "OK" });
      useChzzk({});

      expect(await deps().refreshToken()).toBe(true);
    });

    it("returns false on an ERROR response", async () => {
      setUp();
      fetchMock.mockResolvedValue({ status: "ERROR", code: "x", error: "x" });
      useChzzk({});

      expect(await deps().refreshToken()).toBe(false);
    });
  });

  describe("subscribeChat / unsubscribeChat (deps passed to createChzzkConnection)", () => {
    it("subscribeChat returns true on an OK response", async () => {
      setUp();
      fetchMock.mockResolvedValue({ status: "OK" });
      useChzzk({});

      expect(await deps().subscribeChat("sess-1")).toBe(true);
    });

    it("subscribeChat returns false on an ERROR response", async () => {
      setUp();
      fetchMock.mockResolvedValue({ status: "ERROR", code: "x", error: "x" });
      useChzzk({});

      expect(await deps().subscribeChat("sess-1")).toBe(false);
    });

    it("subscribeChat returns false when $fetch throws", async () => {
      setUp();
      fetchMock.mockRejectedValue(new Error("network down"));
      useChzzk({});

      expect(await deps().subscribeChat("sess-1")).toBe(false);
    });

    it("unsubscribeChat returns true on an OK response", async () => {
      setUp();
      fetchMock.mockResolvedValue({ status: "OK" });
      useChzzk({});

      expect(await deps().unsubscribeChat("sess-1")).toBe(true);
    });

    it("unsubscribeChat returns false on an ERROR response", async () => {
      setUp();
      fetchMock.mockResolvedValue({ status: "ERROR", code: "x", error: "x" });
      useChzzk({});

      expect(await deps().unsubscribeChat("sess-1")).toBe(false);
    });

    it("unsubscribeChat returns false when $fetch throws", async () => {
      setUp();
      fetchMock.mockRejectedValue(new Error("network down"));
      useChzzk({});

      expect(await deps().unsubscribeChat("sess-1")).toBe(false);
    });
  });

  describe("fetchLiveSignal (deps passed to createChzzkConnection)", () => {
    it("returns UNKNOWN without calling $fetch when chzzkChannelId is unset", async () => {
      setUp();
      useChzzk({});

      const result = await fetchLiveSignal();

      expect(result).toEqual({ status: "UNKNOWN" });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("requests /api/chzzk/chatChannelId with the configured channelId in the query", async () => {
      setUp({ chzzkChannelId: "chan-1" });
      fetchMock.mockResolvedValue({
        status: "OK",
        chatChannelId: null,
        liveStatus: "CLOSE",
        openDate: null,
      });
      useChzzk({});

      await fetchLiveSignal();

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/chzzk/chatChannelId",
        expect.objectContaining({ query: { channelId: "chan-1" } }),
      );
    });

    it("returns OPEN with the chatChannelId and logs it when liveStatus is OPEN with a real chatChannelId", async () => {
      setUp({ chzzkChannelId: "chan-1" });
      fetchMock.mockResolvedValue({
        status: "OK",
        chatChannelId: "chat-1",
        liveStatus: "OPEN",
        openDate: "2026-07-27T00:00:00",
      });
      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});
      useChzzk({});

      const result = await fetchLiveSignal();

      expect(result).toEqual({ status: "OPEN", chatChannelId: "chat-1" });
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Chzzk live signal: chatChannelId",
        "chat-1",
      );

      consoleLogSpy.mockRestore();
    });

    it("returns CLOSED and does not log the chatChannelId diagnostic when liveStatus is CLOSE", async () => {
      setUp({ chzzkChannelId: "chan-1" });
      fetchMock.mockResolvedValue({
        status: "OK",
        chatChannelId: null,
        liveStatus: "CLOSE",
        openDate: null,
      });
      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});
      useChzzk({});

      const result = await fetchLiveSignal();

      expect(result).toEqual({ status: "CLOSED" });
      expect(consoleLogSpy).not.toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });

    it("returns OPEN with a null chatChannelId and does not log when chatChannelId is null", async () => {
      setUp({ chzzkChannelId: "chan-1" });
      fetchMock.mockResolvedValue({
        status: "OK",
        chatChannelId: null,
        liveStatus: "OPEN",
        openDate: "2026-07-27T00:00:00",
      });
      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});
      useChzzk({});

      const result = await fetchLiveSignal();

      expect(result).toEqual({ status: "OPEN", chatChannelId: null });
      expect(consoleLogSpy).not.toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });

    it("returns UNKNOWN on an ERROR envelope", async () => {
      setUp({ chzzkChannelId: "chan-1" });
      fetchMock.mockResolvedValue({
        status: "ERROR",
        code: "internal_server_error",
        error: "boom",
      });
      useChzzk({});

      const result = await fetchLiveSignal();

      expect(result).toEqual({ status: "UNKNOWN" });
    });

    it("returns UNKNOWN and logs, without rethrowing, when $fetch throws", async () => {
      setUp({ chzzkChannelId: "chan-1" });
      fetchMock.mockRejectedValue(new Error("network down"));
      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      useChzzk({});

      await expect(fetchLiveSignal()).resolves.toEqual({
        status: "UNKNOWN",
      });
      expect(consoleLogSpy).toHaveBeenCalledWith("Chzzk fetchLiveSignal Error");
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("fetchSubscriptionHealth (deps passed to createChzzkConnection)", () => {
    it("returns UNKNOWN and logs the upstream error on an ERROR envelope", async () => {
      setUp({ chzzkChannelId: "chan-1" });
      fetchMock.mockResolvedValue({
        status: "ERROR",
        code: "internal_server_error",
        error: "boom",
      });
      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});
      useChzzk({});

      const result = await fetchSubscriptionHealth("sess-1");

      expect(result).toBe("UNKNOWN");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Chzzk fetchSubscriptionHealth Error (UNKNOWN): boom",
      );

      consoleLogSpy.mockRestore();
    });

    it("returns SUBSCRIBED when the session is connected with a matching CHAT subscription", async () => {
      setUp({ chzzkChannelId: "chan-1" });
      fetchMock.mockResolvedValue({
        status: "OK",
        sessions: [
          {
            sessionKey: "sess-1",
            connectedDate: "2026-07-27T00:00:00",
            disconnectedDate: null,
            subscribedEvents: [{ eventType: "CHAT", channelId: "chan-1" }],
          },
        ],
      });
      useChzzk({});

      const result = await fetchSubscriptionHealth("sess-1");

      expect(result).toBe("SUBSCRIBED");
    });

    it("returns LOST and logs the offending session when disconnectedDate is set", async () => {
      const session = {
        sessionKey: "sess-1",
        connectedDate: "2026-07-27T00:00:00",
        disconnectedDate: "2026-07-27T01:00:00",
        subscribedEvents: [{ eventType: "CHAT", channelId: "chan-1" }],
      };
      setUp({ chzzkChannelId: "chan-1" });
      fetchMock.mockResolvedValue({ status: "OK", sessions: [session] });
      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});
      useChzzk({});

      const result = await fetchSubscriptionHealth("sess-1");

      expect(result).toBe("LOST");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Chzzk subscription health: LOST",
        session,
      );

      consoleLogSpy.mockRestore();
    });

    it("returns LOST when connected but there is no matching CHAT subscribedEvent", async () => {
      setUp({ chzzkChannelId: "chan-1" });
      fetchMock.mockResolvedValue({
        status: "OK",
        sessions: [
          {
            sessionKey: "sess-1",
            connectedDate: "2026-07-27T00:00:00",
            disconnectedDate: null,
            subscribedEvents: [{ eventType: "DONATION", channelId: "chan-1" }],
          },
        ],
      });
      useChzzk({});

      const result = await fetchSubscriptionHealth("sess-1");

      expect(result).toBe("LOST");
    });

    it("returns UNKNOWN and logs the pagination-caveat reasoning when the session is absent from the list", async () => {
      setUp({ chzzkChannelId: "chan-1" });
      fetchMock.mockResolvedValue({ status: "OK", sessions: [] });
      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});
      useChzzk({});

      const result = await fetchSubscriptionHealth("sess-1");

      expect(result).toBe("UNKNOWN");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("absent from list"),
      );

      consoleLogSpy.mockRestore();
    });

    it("returns UNKNOWN and logs, without rethrowing, when $fetch throws", async () => {
      setUp({ chzzkChannelId: "chan-1" });
      fetchMock.mockRejectedValue(new Error("network down"));
      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      useChzzk({});

      await expect(fetchSubscriptionHealth("sess-1")).resolves.toBe("UNKNOWN");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Chzzk fetchSubscriptionHealth Error (UNKNOWN)",
      );
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("checkAuth (polled via useTimeoutPoll, immediate)", () => {
    it("hides both errors and never calls $fetch when chzzkChannelId is unset", async () => {
      setUp();
      const { errors } = useChzzk({});

      await checkAuth();

      expect(errors.value).toHaveLength(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("hides errors when /api/chzzk/me reports the matching channel", async () => {
      setUp({ chzzkChannelId: "chan-1" });
      fetchMock.mockResolvedValue({
        status: "OK",
        channelId: "chan-1",
        channelName: "name",
      });
      const { errors } = useChzzk({});

      // Seed a login error the same way the real onAuthRequired path would.
      deps().onAuthRequired(true);
      expect(errors.value).toHaveLength(1);

      await checkAuth();

      expect(errors.value).toHaveLength(0);
    });

    it("shows the ccid-mismatch error when /api/chzzk/me reports a different channel", async () => {
      setUp({ chzzkChannelId: "chan-1" });
      fetchMock.mockResolvedValue({
        status: "OK",
        channelId: "chan-2",
        channelName: "name",
      });
      const { errors } = useChzzk({});

      await checkAuth();

      expect(errors.value.map((e) => e.id)).toEqual(["chzzk-ccid-mismatch"]);
    });

    it("shows the login error when /api/chzzk/me fails and refresh also fails", async () => {
      setUp({ chzzkChannelId: "chan-1" });
      fetchMock.mockResolvedValue({ status: "ERROR", code: "x", error: "x" });
      const { errors } = useChzzk({});

      await checkAuth();

      expect(errors.value.map((e) => e.id)).toEqual(["chzzk-login"]);
    });

    it("recovers via refresh when the first /api/chzzk/me attempt fails", async () => {
      setUp({ chzzkChannelId: "chan-1" });
      fetchMock
        .mockRejectedValueOnce(new Error("first /me fails"))
        .mockResolvedValueOnce({ status: "OK" }) // refresh
        .mockResolvedValueOnce({
          status: "OK",
          channelId: "chan-1",
          channelName: "name",
        }); // second /me
      const { errors } = useChzzk({});

      await checkAuth();

      expect(errors.value).toHaveLength(0);
    });
  });

  describe("login-error onClick handler", () => {
    it("redirects to the returned authUrl on success", async () => {
      setUp();
      fetchMock.mockResolvedValue({
        status: "OK",
        authUrl: "https://chzzk.naver.com/auth",
      });
      const { errors } = useChzzk({});
      deps().onAuthRequired(true);

      const originalLocation = window.location;
      // jsdom's window.location is not directly assignable; delete + stub.
      // @ts-expect-error -- intentional test-only override
      delete window.location;
      window.location = { href: "" } as unknown as Location;

      await errors.value[0].onClick?.();

      expect(window.location.href).toBe("https://chzzk.naver.com/auth");

      window.location = originalLocation;
    });

    it("does not navigate and does not throw when the login-url fetch resolves with a non-OK status", async () => {
      setUp();
      fetchMock.mockResolvedValue({
        status: "ERROR",
        code: "x",
        error: "x",
      });
      const { errors } = useChzzk({});
      deps().onAuthRequired(true);

      const originalLocation = window.location;
      // @ts-expect-error -- intentional test-only override
      delete window.location;
      window.location = { href: "" } as unknown as Location;

      await expect(errors.value[0].onClick?.()).resolves.toBeUndefined();

      expect(window.location.href).toBe("");

      window.location = originalLocation;
    });

    it("does not navigate and does not throw when the login-url fetch rejects", async () => {
      setUp();
      fetchMock.mockRejectedValue(new Error("network down"));
      const { errors } = useChzzk({});
      deps().onAuthRequired(true);

      const originalLocation = window.location;
      // @ts-expect-error -- intentional test-only override
      delete window.location;
      window.location = { href: "" } as unknown as Location;

      await expect(errors.value[0].onClick?.()).resolves.toBeUndefined();

      expect(window.location.href).toBe("");

      window.location = originalLocation;
    });
  });

  describe("ccid-mismatch onClick handler", () => {
    it("logs out and reloads on click", async () => {
      setUp({ chzzkChannelId: "chan-1" });
      fetchMock
        .mockResolvedValueOnce({
          status: "OK",
          channelId: "chan-2",
          channelName: "name",
        })
        .mockResolvedValueOnce({ status: "OK" }); // logout
      const { errors } = useChzzk({});
      await checkAuth();
      expect(errors.value.map((e) => e.id)).toEqual(["chzzk-ccid-mismatch"]);

      const originalLocation = window.location;
      const reloadMock = vi.fn();
      // @ts-expect-error -- intentional test-only override
      delete window.location;
      window.location = { reload: reloadMock } as unknown as Location;

      await errors.value[0].onClick?.();

      expect(fetchMock).toHaveBeenLastCalledWith("/api/chzzk/auth/logout", {
        method: "POST",
      });
      expect(reloadMock).toHaveBeenCalled();

      window.location = originalLocation;
    });
  });

  describe("ccid-mismatch error deduplication", () => {
    it("does not add a duplicate chzzk-ccid-mismatch error on repeated checkAuth calls", async () => {
      setUp({ chzzkChannelId: "chan-1" });
      fetchMock.mockResolvedValue({
        status: "OK",
        channelId: "chan-2",
        channelName: "name",
      });
      const { errors } = useChzzk({});

      await checkAuth();
      await checkAuth();
      await checkAuth();

      expect(
        errors.value.filter((e) => e.id === "chzzk-ccid-mismatch"),
      ).toHaveLength(1);
    });
  });

  describe("ccid-mismatch onClick handler error path", () => {
    it("does not reload and does not throw when the logout fetch fails", async () => {
      setUp({ chzzkChannelId: "chan-1" });
      fetchMock
        .mockResolvedValueOnce({
          status: "OK",
          channelId: "chan-2",
          channelName: "name",
        })
        .mockRejectedValueOnce(new Error("logout network down"));
      const { errors } = useChzzk({});
      await checkAuth();
      expect(errors.value.map((e) => e.id)).toEqual(["chzzk-ccid-mismatch"]);

      const originalLocation = window.location;
      const reloadMock = vi.fn();
      // @ts-expect-error -- intentional test-only override
      delete window.location;
      window.location = { reload: reloadMock } as unknown as Location;

      await expect(errors.value[0].onClick?.()).resolves.toBeUndefined();

      expect(reloadMock).not.toHaveBeenCalled();
      // The error is left in place -- the failed logout attempt didn't
      // silently clear it.
      expect(errors.value.map((e) => e.id)).toEqual(["chzzk-ccid-mismatch"]);

      window.location = originalLocation;
    });
  });

  describe("reacting to chzzkChannelId changing", () => {
    it("re-runs checkAuth when chzzkChannelId changes (e.g. via !!set)", async () => {
      setUp();
      // `setUp()` points `useRoute` at a plain (non-reactive) query object;
      // override it here with a reactive one so mutating it after the
      // composable is already running re-triggers the store's computeds and,
      // in turn, useChzzk's `watch(() => chatOptions.value.chzzkChannelId, ...)`.
      const reactiveQuery = reactive<LocationQuery>({});
      vi.mocked(useRoute).mockReturnValue(
        fakeRoute(reactiveQuery as LocationQuery),
      );

      const { errors } = useChzzk({});
      // No chzzkChannelId yet -- checkAuth() (via the immediate poll) hides
      // both errors and never touches $fetch.
      await checkAuth();
      expect(fetchMock).not.toHaveBeenCalled();

      fetchMock.mockResolvedValue({ status: "ERROR", code: "x", error: "x" });
      reactiveQuery.chzzkChannelId = "chan-1";
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      // The watch on chzzkChannelId fired its own checkAuth() independently
      // of the polled one, reaching /api/chzzk/me without needing the
      // 60s poll to tick.
      expect(fetchMock).toHaveBeenCalledWith("/api/chzzk/me");
      expect(errors.value.map((e) => e.id)).toEqual(["chzzk-login"]);
    });
  });

  describe("teardown (onScopeDispose)", () => {
    it("stops the underlying connection when the owning effect scope is disposed", () => {
      setUp();
      const scope = effectScope();
      scope.run(() => {
        useChzzk({});
      });

      const connection = capturedConnection.current as {
        stop: ReturnType<typeof vi.fn>;
      };
      expect(connection.stop).not.toHaveBeenCalled();

      scope.stop();

      expect(connection.stop).toHaveBeenCalledTimes(1);
    });
  });

  describe("leader election wiring", () => {
    it("starts the connection on becoming leader and stops it on losing leadership", () => {
      setUp();
      useChzzk({});

      const connection = capturedConnection.current as {
        start: ReturnType<typeof vi.fn>;
        stop: ReturnType<typeof vi.fn>;
      };

      sharedOptions().onBecomeLeader?.();
      expect(connection.start).toHaveBeenCalledTimes(1);

      sharedOptions().onLoseLeader?.();
      expect(connection.stop).toHaveBeenCalledTimes(1);
    });
  });
});
