import { createPinia, setActivePinia } from "pinia";
import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { computed, nextTick, ref } from "vue";
import type { LocationQuery, RouteLocationNormalizedLoaded } from "vue-router";
import type { ChatItem } from "~/lib/interfaces";

// `useChatItems` concatenates the four platform composables' `chatItems`,
// applies a caller-supplied `filter` predicate, sorts by `timestamp`, and
// slices to `chatOptions.maxChatSize`. The four platform composables
// (useChzzk/useTwitch/useYoutubeLive/useKick) each open real sockets/timers
// and are mocked out entirely here; `useChatOptionsStore` is left real (with
// `useRoute` mocked), matching useChatOptionsStore.test.ts's pattern, since
// only `chatOptions.maxChatSize` actually matters to this composable.

function fakeRoute(query: LocationQuery): RouteLocationNormalizedLoaded {
  return { query } as unknown as RouteLocationNormalizedLoaded;
}

mockNuxtImport("useRoute", () => {
  return vi.fn(() => fakeRoute({}));
});

function makeChatItem(
  platform: ChatItem["platform"],
  id: string,
  timestamp: number,
  overrides: Partial<ChatItem> = {},
): ChatItem {
  return {
    platform,
    id,
    nickname: `nick-${id}`,
    message: `message-${id}`,
    timestamp,
    extra: {},
    ...overrides,
  };
}

mockNuxtImport("useChzzk", () => {
  return vi.fn(() => ({
    chatItems: ref<ChatItem[]>([]),
    clearChat: vi.fn(),
    errors: ref([]),
  }));
});
mockNuxtImport("useTwitch", () => {
  return vi.fn(() => ({
    chatItems: ref<ChatItem[]>([]),
    clearChat: vi.fn(),
  }));
});
mockNuxtImport("useYoutubeLive", () => {
  return vi.fn(() => ({
    chatItems: ref<ChatItem[]>([]),
    clearChat: vi.fn(),
  }));
});
mockNuxtImport("useKick", () => {
  return vi.fn(() => ({
    chatItems: ref<ChatItem[]>([]),
    clearChat: vi.fn(),
    errors: ref([]),
  }));
});

function setUpPlatforms(items: {
  chzzk?: ChatItem[];
  twitch?: ChatItem[];
  youtubeLive?: ChatItem[];
  kick?: ChatItem[];
}) {
  vi.mocked(useChzzk).mockReturnValue({
    chatItems: computed(() => items.chzzk ?? []),
    clearChat: vi.fn(),
    errors: ref([]),
  });
  vi.mocked(useTwitch).mockReturnValue({
    chatItems: computed(() => items.twitch ?? []),
    clearChat: vi.fn(),
  });
  vi.mocked(useYoutubeLive).mockReturnValue({
    chatItems: computed(() => items.youtubeLive ?? []),
    clearChat: vi.fn(),
  });
  vi.mocked(useKick).mockReturnValue({
    chatItems: computed(() => items.kick ?? []),
    clearChat: vi.fn(),
    errors: ref([]),
  });
}

function setUpMaxChatSize(maxChatSize: string | undefined) {
  setActivePinia(createPinia());
  vi.mocked(useRoute).mockReturnValue(
    fakeRoute(maxChatSize === undefined ? {} : { maxChatSize }),
  );
}

describe("useChatItems", () => {
  it("merges all four platforms and sorts the result by timestamp", () => {
    setUpMaxChatSize(undefined);
    setUpPlatforms({
      chzzk: [makeChatItem("chzzk", "c1", 30)],
      twitch: [makeChatItem("twitch", "t1", 10)],
      youtubeLive: [makeChatItem("youtube-live", "y1", 20)],
      kick: [makeChatItem("kick", "k1", 40)],
    });

    const { chatItems } = useChatItems({});

    expect(chatItems.value.map((c) => c.id)).toEqual(["t1", "y1", "c1", "k1"]);
  });

  it("a platform contributing nothing does not break the merge", () => {
    setUpMaxChatSize(undefined);
    setUpPlatforms({
      chzzk: [makeChatItem("chzzk", "c1", 1)],
      // twitch, youtubeLive, kick all contribute []
    });

    const { chatItems } = useChatItems({});

    expect(chatItems.value.map((c) => c.id)).toEqual(["c1"]);
  });

  it("with no filter supplied, every item passes through unfiltered", () => {
    setUpMaxChatSize(undefined);
    setUpPlatforms({
      chzzk: [makeChatItem("chzzk", "c1", 1), makeChatItem("chzzk", "c2", 2)],
    });

    const { chatItems } = useChatItems({});

    expect(chatItems.value).toHaveLength(2);
  });

  it("applies the caller-supplied filter predicate", () => {
    setUpMaxChatSize(undefined);
    setUpPlatforms({
      chzzk: [
        makeChatItem("chzzk", "keep", 1, { nickname: "regular_user" }),
        makeChatItem("chzzk", "drop", 2, { nickname: "spam_bot" }),
      ],
    });

    const { chatItems } = useChatItems({
      filter: (chat) => !chat.nickname.startsWith("spam_"),
    });

    expect(chatItems.value.map((c) => c.id)).toEqual(["keep"]);
  });

  // ChatOverlay.vue (the only real caller) builds its filter as:
  //   new RegExp(chatOptions.value.hiddenUsernameRegex).test(chat.nickname)
  // with NO try/catch around the `new RegExp(...)` call. `useChatOptionsStore`'s
  // hiddenUsernameRegex/hiddenMessageRegex computeds now validate the
  // decoded source with `new RegExp(...)` themselves and return `undefined`
  // when it's invalid, so a malformed regex arriving via the URL (e.g.
  // `?hiddenUsernameRegex=<base64 of "[">`) no longer reaches this
  // `new RegExp(...)` call in practice -- that specific crash-on-mount path
  // is fixed at the store boundary.
  //
  // What's still true, and what this test documents: `Array.prototype.filter`
  // does not catch exceptions from its predicate, and `useChatItems`'s
  // `chatItems` computed does not guard the `.filter` call in any way. So
  // *if* a filter function throws -- from any cause, not just a bad
  // URL-sourced regex -- nothing in this pipeline catches it, and the throw
  // doesn't even wait for a render read: useChatItems's own internal
  // `watch(() => chatItems.value, ..., { immediate: true })` evaluates the
  // computed eagerly, so it happens synchronously during setup. Reproducing
  // that shape here with a hand-built invalid-regex filter (not sourced
  // through the now-validating store):
  it("a filter function that throws (e.g. built from an invalid regex) is not caught anywhere in the pipeline", () => {
    setUpMaxChatSize(undefined);
    setUpPlatforms({
      chzzk: [makeChatItem("chzzk", "c1", 1)],
    });

    // Routed through a variable so it matches what the real code does --
    // a pattern string arriving at runtime from decoded URL state, not a
    // literal ESLint can statically flag as `no-invalid-regexp`.
    const invalidPatternFromUrl: string = "[";
    const regexBackedFilter = (chat: ChatItem) => {
      // Not a valid regex pattern; `new RegExp` throws a SyntaxError.
      const re = new RegExp(invalidPatternFromUrl);
      return !re.test(chat.nickname);
    };

    // The throw doesn't wait for us to read `chatItems.value` -- it fires
    // as soon as `useChatItems` is called, because its own internal
    // `watch(() => chatItems.value, ..., { immediate: true })` eagerly
    // evaluates the computed during setup.
    expect(() => useChatItems({ filter: regexBackedFilter })).toThrow(
      SyntaxError,
    );
  });

  it("trims to maxChatSize, keeping the newest items", () => {
    setUpMaxChatSize("2");
    setUpPlatforms({
      chzzk: [
        makeChatItem("chzzk", "oldest", 1),
        makeChatItem("chzzk", "middle", 2),
        makeChatItem("chzzk", "newest", 3),
      ],
    });

    const { chatItems } = useChatItems({});

    expect(chatItems.value.map((c) => c.id)).toEqual(["middle", "newest"]);
  });

  it("falls back to the default cap of 100 when maxChatSize is absent", () => {
    setUpMaxChatSize(undefined);
    const items = Array.from({ length: 150 }, (_, i) =>
      makeChatItem("chzzk", `item-${i}`, i),
    );
    setUpPlatforms({ chzzk: items });

    const { chatItems } = useChatItems({});

    expect(chatItems.value).toHaveLength(100);
    expect(chatItems.value[0].id).toBe("item-50");
    expect(chatItems.value[99].id).toBe("item-149");
  });

  it("falls back to useChatItems' OWN default of 100 when the store's maxChatSize is undefined (bare `?maxChatSize` flag, not merely omitted)", () => {
    // `setUpMaxChatSize(undefined)` omits the key entirely, which
    // useChatOptionsStore itself already defaults to the number 100 --
    // useChatItems' own `?? 100` fallback on `chatOptions.value.maxChatSize`
    // never actually sees `undefined` that way. The store only ever produces
    // a real `undefined` for a bare flag (`?maxChatSize` with no `=value`,
    // parsed as `null` by vue-router) -- exercise that path specifically so
    // useChatItems' own fallback (not the store's) is what's under test.
    setActivePinia(createPinia());
    vi.mocked(useRoute).mockReturnValue(fakeRoute({ maxChatSize: null }));
    const items = Array.from({ length: 150 }, (_, i) =>
      makeChatItem("chzzk", `item-${i}`, i),
    );
    setUpPlatforms({ chzzk: items });

    const { chatItems } = useChatItems({});

    expect(chatItems.value).toHaveLength(100);
    expect(chatItems.value[0].id).toBe("item-50");
    expect(chatItems.value[99].id).toBe("item-149");
  });

  it("does not call onNewChatItem when the newest item's timestamp does not exceed the last-seen one (e.g. an older item arrives from another platform afterwards)", async () => {
    setUpMaxChatSize(undefined);
    // Kept as a plain ref (the source of truth the test mutates below) and
    // wrapped in a computed for the mock, so the mock's declared type
    // (ComputedRef<ChatItem[]>, matching useChzzk's real return type) still
    // reacts to `chzzkItems.value` being reassigned.
    const chzzkItems = ref<ChatItem[]>([makeChatItem("chzzk", "first", 100)]);
    vi.mocked(useChzzk).mockReturnValue({
      chatItems: computed(() => chzzkItems.value),
      clearChat: vi.fn(),
      errors: ref([]),
    });
    vi.mocked(useTwitch).mockReturnValue({
      chatItems: computed(() => []),
      clearChat: vi.fn(),
    });
    vi.mocked(useYoutubeLive).mockReturnValue({
      chatItems: computed(() => []),
      clearChat: vi.fn(),
    });
    vi.mocked(useKick).mockReturnValue({
      chatItems: computed(() => []),
      clearChat: vi.fn(),
      errors: ref([]),
    });

    const onNewChatItem = vi.fn();
    useChatItems({ onNewChatItem });
    expect(onNewChatItem).toHaveBeenCalledTimes(1);

    // A late-arriving item with an OLDER timestamp sorts before "first", so
    // the merged list's last item is still "first" (timestamp unchanged) --
    // the watcher fires (new array reference) but must not re-notify.
    chzzkItems.value = [
      ...chzzkItems.value,
      makeChatItem("chzzk", "older", 50),
    ];
    await nextTick();

    expect(onNewChatItem).toHaveBeenCalledTimes(1);
  });

  describe("!!clear broadcaster command wiring (useCommand's onClear)", () => {
    it("clears all four platforms' chat lists when the broadcaster sends !!clear", () => {
      setUpMaxChatSize(undefined);
      const chzzkClearChat = vi.fn();
      const twitchClearChat = vi.fn();
      const youtubeLiveClearChat = vi.fn();
      const kickClearChat = vi.fn();
      vi.mocked(useChzzk).mockReturnValue({
        chatItems: computed(() => []),
        clearChat: chzzkClearChat,
        errors: ref([]),
      });
      vi.mocked(useTwitch).mockReturnValue({
        chatItems: computed(() => []),
        clearChat: twitchClearChat,
      });
      vi.mocked(useYoutubeLive).mockReturnValue({
        chatItems: computed(() => []),
        clearChat: youtubeLiveClearChat,
      });
      vi.mocked(useKick).mockReturnValue({
        chatItems: computed(() => []),
        clearChat: kickClearChat,
        errors: ref([]),
      });

      useChatItems({});

      // Each platform composable receives the SAME onBroadcasterMessage
      // callback (useCommand's own dispatcher) -- grab it off any one of the
      // mocked calls and drive it exactly the way a real chat message would.
      // `useChzzk`'s mock accumulates calls across every test in this file,
      // so grab THIS test's own call (the most recent one), not calls[0].
      const { onBroadcasterMessage } = vi
        .mocked(useChzzk)
        .mock.calls.at(-1)![0] as {
        onBroadcasterMessage: (message: string) => boolean;
      };

      const handled = onBroadcasterMessage("!!clear");

      expect(handled).toBe(true);
      expect(chzzkClearChat).toHaveBeenCalledTimes(1);
      expect(twitchClearChat).toHaveBeenCalledTimes(1);
      expect(youtubeLiveClearChat).toHaveBeenCalledTimes(1);
      expect(kickClearChat).toHaveBeenCalledTimes(1);
    });

    it("does not clear anything for a message that isn't a recognised command", () => {
      setUpMaxChatSize(undefined);
      const chzzkClearChat = vi.fn();
      vi.mocked(useChzzk).mockReturnValue({
        chatItems: computed(() => []),
        clearChat: chzzkClearChat,
        errors: ref([]),
      });

      useChatItems({});
      // `useChzzk`'s mock accumulates calls across every test in this file,
      // so grab THIS test's own call (the most recent one), not calls[0].
      const { onBroadcasterMessage } = vi
        .mocked(useChzzk)
        .mock.calls.at(-1)![0] as {
        onBroadcasterMessage: (message: string) => boolean;
      };

      const handled = onBroadcasterMessage("just chatting");

      expect(handled).toBe(false);
      expect(chzzkClearChat).not.toHaveBeenCalled();
    });
  });

  it("collects errors from chzzk", () => {
    setUpMaxChatSize(undefined);
    setUpPlatforms({});
    vi.mocked(useChzzk).mockReturnValue({
      chatItems: computed(() => []),
      clearChat: vi.fn(),
      errors: ref([
        { id: "err1", platform: "chzzk", message: "channel ID mismatch" },
      ]),
    });

    const { errors } = useChatItems({});

    expect(errors.value).toEqual([
      { id: "err1", platform: "chzzk", message: "channel ID mismatch" },
    ]);
  });

  it("collects errors from kick", () => {
    setUpMaxChatSize(undefined);
    setUpPlatforms({});
    vi.mocked(useKick).mockReturnValue({
      chatItems: computed(() => []),
      clearChat: vi.fn(),
      errors: ref([
        { id: "kick-pusher-error", platform: "kick", message: "pusher error" },
      ]),
    });

    const { errors } = useChatItems({});

    expect(errors.value).toEqual([
      { id: "kick-pusher-error", platform: "kick", message: "pusher error" },
    ]);
  });

  it("merges errors from both chzzk and kick", () => {
    setUpMaxChatSize(undefined);
    setUpPlatforms({});
    vi.mocked(useChzzk).mockReturnValue({
      chatItems: computed(() => []),
      clearChat: vi.fn(),
      errors: ref([
        { id: "err1", platform: "chzzk", message: "channel ID mismatch" },
      ]),
    });
    vi.mocked(useKick).mockReturnValue({
      chatItems: computed(() => []),
      clearChat: vi.fn(),
      errors: ref([
        { id: "kick-pusher-error", platform: "kick", message: "pusher error" },
      ]),
    });

    const { errors } = useChatItems({});

    expect(errors.value).toEqual([
      { id: "err1", platform: "chzzk", message: "channel ID mismatch" },
      { id: "kick-pusher-error", platform: "kick", message: "pusher error" },
    ]);
  });
});
