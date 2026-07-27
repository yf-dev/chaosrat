import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import ChatOverlay from "~/components/ChatOverlay.vue";
import DefaultChatList from "~/components/themes/default/DefaultChatList.vue";
import ColorfulChatList from "~/components/themes/colorful/ColorfulChatList.vue";
import VideoMasterChatList from "~/components/themes/video-master/VideoMasterChatList.vue";
import SimpleChatList from "~/components/themes/simple/SimpleChatList.vue";
import PureChatList from "~/components/themes/pure/PureChatList.vue";
import CuteChatLeftList from "~/components/themes/cute/CuteChatLeftList.vue";
import CuteChatRightList from "~/components/themes/cute/CuteChatRightList.vue";
import type {
  ChatItem,
  ChatOptions,
  ChatPlatformError,
} from "~/lib/interfaces";
import type { ChatItemsOptions } from "~/composables/useChatItems";

// ChatOverlay.vue pulls in three auto-imported composables/store that each
// have their own dedicated test coverage elsewhere (or -- for useChatItems --
// do real socket/timer work): useChatOptionsStore, useChatItems, and
// useOpenDcconSelector. All three are mocked here so these tests exercise
// only ChatOverlay's own decision-making: which theme component to render,
// how it builds its filter predicate from the (already-validated, per
// useChatOptionsStore.test.ts) regex options, how it picks a sound effect
// URL/volume, and how it re-encodes emoji/sticker markers before rendering.
//
// Mocking useChatOptionsStore (rather than leaving it real + mocking
// useRoute, as useChatItems.test.ts does for a bare composable call) is
// required here specifically because ChatOverlay is *mounted* as a
// component: @nuxt/test-utils' mountSuspended reuses one shared NuxtApp (and
// Pinia instance) across every `it()` in this file, so a real store's
// `chatOptions` -- captured from `useRoute()` once at first construction --
// would not react to a different route mock in a later test.
mockNuxtImport("useChatOptionsStore", () => {
  return vi.fn();
});
mockNuxtImport("useChatItems", () => {
  return vi.fn();
});
mockNuxtImport("useOpenDcconSelector", () => {
  return vi.fn(() => ({ stickerItems: ref([]) }));
});

function setChatOptions(overrides: Partial<ChatOptions> = {}) {
  vi.mocked(useChatOptionsStore).mockReturnValue({
    chatOptions: ref<ChatOptions>({
      theme: "default",
      isHidePlatformIcon: false,
      soundEffectType: "none",
      ...overrides,
    }),
  } as unknown as ReturnType<typeof useChatOptionsStore>);
}

let capturedChatItemsOptions: ChatItemsOptions | undefined;

function setUpChatItems(
  items: ChatItem[],
  errors: ChatPlatformError[] = [],
): void {
  capturedChatItemsOptions = undefined;
  vi.mocked(useChatItems).mockImplementation((options) => {
    capturedChatItemsOptions = options;
    return { chatItems: ref(items), errors: ref(errors) };
  });
}

function makeChatItem(overrides: Partial<ChatItem> = {}): ChatItem {
  return {
    platform: "chzzk",
    id: "c1",
    nickname: "nick_one",
    message: "hello world",
    timestamp: 1,
    extra: {},
    ...overrides,
  };
}

const allThemeComponents = [
  DefaultChatList,
  ColorfulChatList,
  VideoMasterChatList,
  SimpleChatList,
  PureChatList,
  CuteChatLeftList,
  CuteChatRightList,
];

beforeEach(() => {
  setChatOptions();
  setUpChatItems([]);
});

describe("theme selection", () => {
  it.each([
    ["colorful", ColorfulChatList],
    ["video-master", VideoMasterChatList],
    ["simple", SimpleChatList],
    ["pure", PureChatList],
    ["cute-left", CuteChatLeftList],
    ["cute-right", CuteChatRightList],
    ["default", DefaultChatList],
    [undefined, DefaultChatList],
    ["not-a-real-theme", DefaultChatList],
    // `useChatOptionsStore`'s own `theme` computed already narrows unknown
    // query values to `undefined` (see useChatOptionsStore.test.ts); this
    // last case documents that ChatOverlay's own `switch`'s `default` case
    // provides the same fallback independently, in case that upstream
    // narrowing ever changes.
  ] as const)(
    "theme=%s renders the expected theme component",
    async (theme, expectedComponent) => {
      setChatOptions({ theme: theme as ChatOptions["theme"] });

      const wrapper = await mountSuspended(ChatOverlay);

      for (const component of allThemeComponents) {
        expect(wrapper.findComponent(component).exists()).toBe(
          component === expectedComponent,
        );
      }
    },
  );
});

describe("chat item filtering (hiddenUsernameRegex / hiddenMessageRegex)", () => {
  it("filters out a chat item whose nickname matches hiddenUsernameRegex", async () => {
    setChatOptions({ hiddenUsernameRegex: "^spam_" });

    await mountSuspended(ChatOverlay);
    const filter = capturedChatItemsOptions!.filter!;

    expect(filter(makeChatItem({ nickname: "spam_bot" }))).toBe(false);
    expect(filter(makeChatItem({ nickname: "regular_user" }))).toBe(true);
  });

  it("filters out a chat item whose message matches hiddenMessageRegex", async () => {
    setChatOptions({ hiddenMessageRegex: "bad.?word" });

    await mountSuspended(ChatOverlay);
    const filter = capturedChatItemsOptions!.filter!;

    expect(filter(makeChatItem({ message: "this has a badword in it" }))).toBe(
      false,
    );
    expect(filter(makeChatItem({ message: "this is fine" }))).toBe(true);
  });

  it("with neither regex configured, nothing is filtered", async () => {
    setChatOptions({});

    await mountSuspended(ChatOverlay);
    const filter = capturedChatItemsOptions!.filter!;

    expect(
      filter(makeChatItem({ nickname: "anyone", message: "anything" })),
    ).toBe(true);
  });

  it("an invalid pattern (as neutralized by useChatOptionsStore, which never lets ChatOverlay see a broken one) results in no filtering, not a crash", async () => {
    // useChatOptionsStore.test.ts documents that an invalid regex source
    // decoded from the URL makes its own `hiddenUsernameRegex`/
    // `hiddenMessageRegex` computeds return `undefined` rather than a broken
    // pattern string. This pins ChatOverlay's side of that contract: given
    // `undefined` (never an invalid string), mounting must not throw, and
    // the resulting filter must let everything through.
    setChatOptions({
      hiddenUsernameRegex: undefined,
      hiddenMessageRegex: undefined,
    });

    await expect(mountSuspended(ChatOverlay)).resolves.toBeDefined();
    const filter = capturedChatItemsOptions!.filter!;

    expect(filter(makeChatItem({ nickname: "[", message: "[" }))).toBe(true);
  });
});

describe("isHidePlatformIcon", () => {
  it("hides the platform icon in the rendered theme when true", async () => {
    setChatOptions({ theme: "default", isHidePlatformIcon: true });
    setUpChatItems([makeChatItem({ id: "i1" })]);

    const wrapper = await mountSuspended(ChatOverlay);

    expect(wrapper.find("img.icon").exists()).toBe(false);
  });

  it("shows the platform icon in the rendered theme when false", async () => {
    setChatOptions({ theme: "default", isHidePlatformIcon: false });
    setUpChatItems([makeChatItem({ id: "i2" })]);

    const wrapper = await mountSuspended(ChatOverlay);

    expect(wrapper.find("img.icon").exists()).toBe(true);
  });
});

describe("sticker/emoji encoding", () => {
  it("renders emoji and sticker markers found in the message as real <img> elements", async () => {
    setChatOptions({ theme: "default" });
    vi.mocked(useOpenDcconSelector).mockReturnValue({
      stickerItems: ref([{ id: "cat", url: "https://example.com/cat.png" }]),
    });
    setUpChatItems([
      makeChatItem({
        id: "e1",
        message: "hello emoji1 ~cat",
        extra: { emojis: { emoji1: "https://example.com/emoji1.png" } },
      }),
    ]);

    const wrapper = await mountSuspended(ChatOverlay);

    const emojiImg = wrapper.find("img.emoji");
    expect(emojiImg.exists()).toBe(true);
    expect(emojiImg.attributes("src")).toBe("https://example.com/emoji1.png");

    const stickerImg = wrapper.find("img.sticker");
    expect(stickerImg.exists()).toBe(true);
    expect(stickerImg.attributes("src")).toBe("https://example.com/cat.png");
  });

  it("a message with no matching emoji/sticker markers is left untouched", async () => {
    setChatOptions({ theme: "default" });
    setUpChatItems([
      makeChatItem({ id: "e2", message: "plain message, nothing special" }),
    ]);

    const wrapper = await mountSuspended(ChatOverlay);

    expect(wrapper.find("img.emoji").exists()).toBe(false);
    expect(wrapper.find("img.sticker").exists()).toBe(false);
    expect(wrapper.text()).toContain("plain message, nothing special");
  });
});

describe("errors", () => {
  it("renders no error box when there are no errors", async () => {
    setUpChatItems([], []);

    const wrapper = await mountSuspended(ChatOverlay);

    expect(wrapper.find(".error-box").exists()).toBe(false);
  });

  it("renders one .error-item per error, and marks only the ones with onClick as clickable", async () => {
    const onClick = vi.fn();
    setUpChatItems(
      [],
      [
        { id: "err1", platform: "chzzk", message: "channel ID mismatch" },
        { id: "err2", platform: "chzzk", message: "clickable one", onClick },
      ],
    );

    const wrapper = await mountSuspended(ChatOverlay);
    const items = wrapper.findAll(".error-item");

    expect(items).toHaveLength(2);
    expect(items[0].text()).toBe("channel ID mismatch");
    expect(items[0].classes()).not.toContain("clickable");
    expect(items[1].classes()).toContain("clickable");

    await items[1].trigger("click");
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("sound effects", () => {
  class FakeAudio {
    src: string;
    volume = 1;
    play = vi.fn().mockResolvedValue(undefined);
    remove = vi.fn();
    constructor(src?: string) {
      this.src = src ?? "";
    }
  }
  let audioInstances: FakeAudio[];

  beforeEach(() => {
    audioInstances = [];
    vi.stubGlobal(
      "Audio",
      class extends FakeAudio {
        constructor(src?: string) {
          super(src);
          audioInstances.push(this);
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("plays the configured sound effect at the configured volume when a new chat item arrives", async () => {
    setChatOptions({ soundEffectType: "beep", soundEffectVolume: 50 });

    await mountSuspended(ChatOverlay);
    capturedChatItemsOptions!.onNewChatItem!(makeChatItem({ id: "new1" }));

    expect(audioInstances).toHaveLength(1);
    expect(audioInstances[0].src).toBe("/sound-effects/beep.mp3");
    expect(audioInstances[0].volume).toBe(0.5);
    expect(audioInstances[0].play).toHaveBeenCalledOnce();

    await flushPromises();
    expect(audioInstances[0].remove).toHaveBeenCalledOnce();
  });

  it.each([
    ["beep", "/sound-effects/beep.mp3"],
    ["bell", "/sound-effects/bell.mp3"],
    ["pingpong-bounce", "/sound-effects/pingpong-bounce.mp3"],
    ["retro-acute", "/sound-effects/retro-acute.mp3"],
    ["retro-blob", "/sound-effects/retro-blob.mp3"],
    ["retro-coin", "/sound-effects/retro-coin.mp3"],
    ["scifi-terminal", "/sound-effects/scifi-terminal.mp3"],
    ["synth-beep", "/sound-effects/synth-beep.mp3"],
  ] as const)(
    "maps soundEffectType=%s to %s",
    async (soundEffectType, expectedUrl) => {
      setChatOptions({ soundEffectType });

      await mountSuspended(ChatOverlay);
      capturedChatItemsOptions!.onNewChatItem!(makeChatItem({ id: "map" }));

      expect(audioInstances[0].src).toBe(expectedUrl);
    },
  );

  it("defaults to full volume when soundEffectVolume is not set", async () => {
    setChatOptions({ soundEffectType: "bell", soundEffectVolume: undefined });

    await mountSuspended(ChatOverlay);
    capturedChatItemsOptions!.onNewChatItem!(makeChatItem({ id: "new2" }));

    expect(audioInstances[0].volume).toBe(1.0);
  });

  it("uses the custom URL for soundEffectType=custom", async () => {
    setChatOptions({
      soundEffectType: "custom",
      soundEffectCustomUrl: "https://example.com/custom.mp3",
    });

    await mountSuspended(ChatOverlay);
    capturedChatItemsOptions!.onNewChatItem!(makeChatItem({ id: "new3" }));

    expect(audioInstances[0].src).toBe("https://example.com/custom.mp3");
  });

  it("plays nothing for soundEffectType=custom with no custom URL configured", async () => {
    setChatOptions({
      soundEffectType: "custom",
      soundEffectCustomUrl: undefined,
    });

    await mountSuspended(ChatOverlay);
    capturedChatItemsOptions!.onNewChatItem!(makeChatItem({ id: "new3b" }));

    expect(audioInstances).toHaveLength(0);
  });

  it("plays nothing when soundEffectType is none", async () => {
    setChatOptions({ soundEffectType: "none" });

    await mountSuspended(ChatOverlay);
    capturedChatItemsOptions!.onNewChatItem!(makeChatItem({ id: "new4" }));

    expect(audioInstances).toHaveLength(0);
  });

  it("logs (rather than throws) when play() rejects, e.g. an autoplay block", async () => {
    setChatOptions({ soundEffectType: "beep" });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await mountSuspended(ChatOverlay);
    // Replace `Audio` with a variant whose play() rejects, simulating e.g. a
    // browser autoplay block.
    vi.stubGlobal(
      "Audio",
      class extends FakeAudio {
        play = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
        constructor(src?: string) {
          super(src);
          audioInstances.push(this);
        }
      },
    );

    expect(() =>
      capturedChatItemsOptions!.onNewChatItem!(makeChatItem({ id: "new5" })),
    ).not.toThrow();
    await flushPromises();

    expect(consoleError).toHaveBeenCalledWith(new Error("NotAllowedError"));
    consoleError.mockRestore();
  });
});
