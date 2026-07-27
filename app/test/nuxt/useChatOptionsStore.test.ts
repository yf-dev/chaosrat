import { createPinia, setActivePinia } from "pinia";
import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import type { LocationQuery, RouteLocationNormalizedLoaded } from "vue-router";
import { encodeUrlSafeBase64 } from "~/lib/utils";

// `useChatOptionsStore` derives every option from `route.query` via
// computeds and exposes only the merged `chatOptions` object (no per-field
// getters), so every assertion below reads `store.chatOptions.<field>`.
//
// `useRoute` is mocked so each test can drive `route.query` directly without
// touching the router or navigating anywhere.

function fakeRoute(query: LocationQuery): RouteLocationNormalizedLoaded {
  return { query } as unknown as RouteLocationNormalizedLoaded;
}

mockNuxtImport("useRoute", () => {
  return vi.fn(() => fakeRoute({}));
});

function storeFor(query: LocationQuery) {
  setActivePinia(createPinia());
  vi.mocked(useRoute).mockReturnValue(fakeRoute(query));
  return useChatOptionsStore();
}

describe("useChatOptionsStore", () => {
  describe("plain string options (chzzkChannelId, twitchChannel, youtubeHandle, kickChannel, soundEffectCustomUrl)", () => {
    it.each([
      ["chzzkChannelId", "abc123"],
      ["twitchChannel", "some_channel"],
      ["youtubeHandle", "@someone"],
      ["kickChannel", "kick-channel"],
      ["soundEffectCustomUrl", "https://example.com/sound.mp3"],
    ] as const)("%s: happy path takes the scalar query value", (key, value) => {
      const store = storeFor({ [key]: value });
      expect(store.chatOptions[key]).toBe(value);
    });

    it.each([
      "chzzkChannelId",
      "twitchChannel",
      "youtubeHandle",
      "kickChannel",
      "soundEffectCustomUrl",
    ] as const)("%s: repeated param (array) takes the first element", (key) => {
      const store = storeFor({ [key]: ["first", "second"] });
      expect(store.chatOptions[key]).toBe("first");
    });

    it.each([
      "chzzkChannelId",
      "twitchChannel",
      "youtubeHandle",
      "kickChannel",
      "soundEffectCustomUrl",
    ] as const)("%s: missing param falls back to undefined", (key) => {
      const store = storeFor({});
      expect(store.chatOptions[key]).toBeUndefined();
    });

    it("chzzkChannelId: a bare flag (null query value) falls back to undefined", () => {
      const store = storeFor({ chzzkChannelId: null });
      expect(store.chatOptions.chzzkChannelId).toBeUndefined();
    });

    it.each([
      "chzzkChannelId",
      "twitchChannel",
      "youtubeHandle",
      "kickChannel",
      "soundEffectCustomUrl",
    ] as const)(
      "%s: repeated param whose first element is null falls back to undefined",
      (key) => {
        const store = storeFor({ [key]: [null, "second"] });
        expect(store.chatOptions[key]).toBeUndefined();
      },
    );
  });

  describe("theme", () => {
    it.each([
      "default",
      "colorful",
      "video-master",
      "simple",
      "pure",
      "cute-left",
      "cute-right",
    ] as const)("accepts the known value %s", (value) => {
      const store = storeFor({ theme: value });
      expect(store.chatOptions.theme).toBe(value);
    });

    it("falls back to undefined for an unknown theme", () => {
      const store = storeFor({ theme: "not-a-real-theme" });
      expect(store.chatOptions.theme).toBeUndefined();
    });

    it("falls back to undefined when missing", () => {
      const store = storeFor({});
      expect(store.chatOptions.theme).toBeUndefined();
    });

    it("takes the first element for a repeated param", () => {
      const store = storeFor({ theme: ["cute-left", "cute-right"] });
      expect(store.chatOptions.theme).toBe("cute-left");
    });

    it("falls back to undefined when the repeated param's first element is unknown", () => {
      const store = storeFor({ theme: ["garbage", "cute-right"] });
      expect(store.chatOptions.theme).toBeUndefined();
    });
  });

  describe("maxChatSize", () => {
    it("parses a valid numeric string", () => {
      const store = storeFor({ maxChatSize: "42" });
      expect(store.chatOptions.maxChatSize).toBe(42);
    });

    it("falls back to the default (100) for a non-numeric value", () => {
      const store = storeFor({ maxChatSize: "not-a-number" });
      expect(store.chatOptions.maxChatSize).toBe(100);
    });

    it("falls back to the default (100) when missing entirely", () => {
      const store = storeFor({});
      expect(store.chatOptions.maxChatSize).toBe(100);
    });

    it("takes the first element for a repeated param", () => {
      const store = storeFor({ maxChatSize: ["7", "99"] });
      expect(store.chatOptions.maxChatSize).toBe(7);
    });

    // NOTE (quirk, not asserted as a "bug" here): a bare flag with no `=`
    // (`?maxChatSize`) yields `null`, which the store special-cases to
    // `undefined` -- NOT the numeric default 100 that a garbage string or a
    // missing key produce. Downstream, `useChatItems.ts` re-applies
    // `?? 100`, so the end behaviour is the same either way, but the store
    // itself is inconsistent about what "no usable value" means.
    it("a bare flag (null query value) yields undefined, not the numeric default", () => {
      const store = storeFor({ maxChatSize: null });
      expect(store.chatOptions.maxChatSize).toBeUndefined();
    });

    it("a repeated param whose first element is null yields undefined", () => {
      const store = storeFor({ maxChatSize: [null, "5"] });
      expect(store.chatOptions.maxChatSize).toBeUndefined();
    });
  });

  describe("soundEffectVolume (same parsing shape as maxChatSize)", () => {
    it("parses a valid numeric string", () => {
      const store = storeFor({ soundEffectVolume: "80" });
      expect(store.chatOptions.soundEffectVolume).toBe(80);
    });

    it("falls back to the default (100) for a non-numeric value", () => {
      const store = storeFor({ soundEffectVolume: "loud" });
      expect(store.chatOptions.soundEffectVolume).toBe(100);
    });

    it("falls back to the default (100) when missing", () => {
      const store = storeFor({});
      expect(store.chatOptions.soundEffectVolume).toBe(100);
    });

    it("a bare flag (null query value) yields undefined, not the numeric default", () => {
      const store = storeFor({ soundEffectVolume: null });
      expect(store.chatOptions.soundEffectVolume).toBeUndefined();
    });

    it("takes the first element for a repeated param", () => {
      const store = storeFor({ soundEffectVolume: ["50", "99"] });
      expect(store.chatOptions.soundEffectVolume).toBe(50);
    });

    it("a repeated param whose first element is null yields undefined", () => {
      const store = storeFor({ soundEffectVolume: [null, "50"] });
      expect(store.chatOptions.soundEffectVolume).toBeUndefined();
    });
  });

  describe("soundEffectType", () => {
    it.each([
      "none",
      "beep",
      "bell",
      "pingpong-bounce",
      "retro-acute",
      "retro-blob",
      "retro-coin",
      "scifi-terminal",
      "synth-beep",
      "custom",
    ] as const)("accepts the known value %s", (value) => {
      const store = storeFor({ soundEffectType: value });
      expect(store.chatOptions.soundEffectType).toBe(value);
    });

    it("falls back to undefined for an unknown value", () => {
      const store = storeFor({ soundEffectType: "explosion" });
      expect(store.chatOptions.soundEffectType).toBeUndefined();
    });

    it("falls back to undefined when missing", () => {
      const store = storeFor({});
      expect(store.chatOptions.soundEffectType).toBeUndefined();
    });

    it("takes the first element for a repeated param", () => {
      const store = storeFor({ soundEffectType: ["beep", "bell"] });
      expect(store.chatOptions.soundEffectType).toBe("beep");
    });
  });

  describe("hiddenUsernameRegex / hiddenMessageRegex (base64url-encoded)", () => {
    it.each(["hiddenUsernameRegex", "hiddenMessageRegex"] as const)(
      "%s: decodes a valid base64url-encoded value",
      (key) => {
        const encoded = encodeUrlSafeBase64("^bot_.*$");
        const store = storeFor({ [key]: encoded });
        expect(store.chatOptions[key]).toBe("^bot_.*$");
      },
    );

    it.each(["hiddenUsernameRegex", "hiddenMessageRegex"] as const)(
      "%s: falls back to undefined when missing",
      (key) => {
        const store = storeFor({});
        expect(store.chatOptions[key]).toBeUndefined();
      },
    );

    it.each(["hiddenUsernameRegex", "hiddenMessageRegex"] as const)(
      "%s: falls back to undefined for an empty string value (bare `key=`)",
      (key) => {
        const store = storeFor({ [key]: "" });
        expect(store.chatOptions[key]).toBeUndefined();
      },
    );

    it.each(["hiddenUsernameRegex", "hiddenMessageRegex"] as const)(
      "%s: falls back to undefined for a bare flag (null query value)",
      (key) => {
        const store = storeFor({ [key]: null });
        expect(store.chatOptions[key]).toBeUndefined();
      },
    );

    it.each(["hiddenUsernameRegex", "hiddenMessageRegex"] as const)(
      "%s: decodes the first element of a repeated param",
      (key) => {
        const encoded = encodeUrlSafeBase64("first-value");
        const store = storeFor({ [key]: [encoded, "ignored"] });
        expect(store.chatOptions[key]).toBe("first-value");
      },
    );

    it.each(["hiddenUsernameRegex", "hiddenMessageRegex"] as const)(
      "%s: repeated param whose first element is an empty string falls back to undefined",
      (key) => {
        const store = storeFor({ [key]: ["", "ignored"] });
        expect(store.chatOptions[key]).toBeUndefined();
      },
    );

    it.each(["hiddenUsernameRegex", "hiddenMessageRegex"] as const)(
      "%s: repeated param whose first element is null falls back to undefined",
      (key) => {
        const store = storeFor({ [key]: [null, "ignored"] });
        expect(store.chatOptions[key]).toBeUndefined();
      },
    );

    // The decoder (`js-base64`'s `decode`) never throws on malformed input --
    // it silently returns a garbled string. This test pins the "doesn't
    // throw" behaviour of the decode step itself; it deliberately does NOT
    // assert what the garbled output equals, since that's an implementation
    // detail of the base64 decoder, not a contract of this store.
    it("does not throw for a value that isn't valid base64url, for either field", () => {
      expect(() =>
        storeFor({ hiddenUsernameRegex: "!!!not-valid-base64!!!" }),
      ).not.toThrow();
      const store = storeFor({ hiddenMessageRegex: "!!!not-valid-base64!!!" });
      // Whatever garbled string the decoder produces here, it happens not to
      // be a syntactically invalid regex source, so it passes the store's
      // validation through unchanged.
      expect(typeof store.chatOptions.hiddenMessageRegex).toBe("string");
    });

    // FIXED: the store now validates the decoded source with
    // `new RegExp(...)` and returns `undefined` when it throws, instead of
    // handing a syntactically invalid pattern to whatever eventually
    // constructs a RegExp from it (ChatOverlay.vue, with no try/catch).
    it.each(["hiddenUsernameRegex", "hiddenMessageRegex"] as const)(
      "%s: a syntactically valid regex source is decoded and passed through",
      (key) => {
        const encoded = encodeUrlSafeBase64("^bot_.*$");
        const store = storeFor({ [key]: encoded });
        expect(store.chatOptions[key]).toBe("^bot_.*$");
      },
    );

    it.each(["hiddenUsernameRegex", "hiddenMessageRegex"] as const)(
      "%s: a syntactically invalid regex source (e.g. an unclosed character class) decodes but yields undefined instead of crashing",
      (key) => {
        const encoded = encodeUrlSafeBase64("[unclosed");
        const store = storeFor({ [key]: encoded });
        expect(store.chatOptions[key]).toBeUndefined();
      },
    );
  });

  describe("isUseOpenDcconSelector / isHidePlatformIcon / isDisableAnimation (boolean flags)", () => {
    it.each([
      "isUseOpenDcconSelector",
      "isHidePlatformIcon",
      "isDisableAnimation",
    ] as const)("%s: missing param is false", (key) => {
      const store = storeFor({});
      expect(store.chatOptions[key]).toBe(false);
    });

    it.each([
      "isUseOpenDcconSelector",
      "isHidePlatformIcon",
      "isDisableAnimation",
    ] as const)(
      "%s: a bare flag (null query value, e.g. `?%s`) is false",
      (key) => {
        const store = storeFor({ [key]: null });
        expect(store.chatOptions[key]).toBe(false);
      },
    );

    it.each([
      "isUseOpenDcconSelector",
      "isHidePlatformIcon",
      "isDisableAnimation",
    ] as const)("%s: `=true` is true", (key) => {
      const store = storeFor({ [key]: "true" });
      expect(store.chatOptions[key]).toBe(true);
    });

    // FIXED: the computed used to do `!!route.query.<key>`. Any non-empty
    // *string* is truthy in JS, including the literal string "false", so
    // explicitly writing `?isUseOpenDcconSelector=false` in the URL used to
    // turn the flag ON -- the opposite of what a user typing that would
    // expect. The store now special-cases the literal strings "false" and
    // "0" to read as false.
    it.each([
      "isUseOpenDcconSelector",
      "isHidePlatformIcon",
      "isDisableAnimation",
    ] as const)(
      "%s: the literal string '=false' is treated as false",
      (key) => {
        const store = storeFor({ [key]: "false" });
        expect(store.chatOptions[key]).toBe(false);
      },
    );

    it.each([
      "isUseOpenDcconSelector",
      "isHidePlatformIcon",
      "isDisableAnimation",
    ] as const)("%s: the literal string '=0' is treated as false", (key) => {
      const store = storeFor({ [key]: "0" });
      expect(store.chatOptions[key]).toBe(false);
    });

    // The URL builder (pages/index.vue) never writes anything but "true" or
    // omits the key -- it never writes an arbitrary string. This pins the
    // pre-existing "any other non-empty string is truthy" fallback so that
    // hand-written URLs using e.g. `=1` or `=yes` keep behaving as they did
    // before this fix.
    it.each([
      "isUseOpenDcconSelector",
      "isHidePlatformIcon",
      "isDisableAnimation",
    ] as const)(
      "%s: an arbitrary non-empty string other than 'false'/'0' is treated as true",
      (key) => {
        const store = storeFor({ [key]: "yes" });
        expect(store.chatOptions[key]).toBe(true);
      },
    );

    it.each([
      "isUseOpenDcconSelector",
      "isHidePlatformIcon",
      "isDisableAnimation",
    ] as const)(
      "%s: repeated param takes the first element (truthy string)",
      (key) => {
        const store = storeFor({ [key]: ["true", "false"] });
        expect(store.chatOptions[key]).toBe(true);
      },
    );

    it.each([
      "isUseOpenDcconSelector",
      "isHidePlatformIcon",
      "isDisableAnimation",
    ] as const)(
      "%s: repeated param whose first element is 'false' is false",
      (key) => {
        const store = storeFor({ [key]: ["false", "true"] });
        expect(store.chatOptions[key]).toBe(false);
      },
    );

    it.each([
      "isUseOpenDcconSelector",
      "isHidePlatformIcon",
      "isDisableAnimation",
    ] as const)(
      "%s: repeated param whose first element is null is false",
      (key) => {
        const store = storeFor({ [key]: [null, "true"] });
        expect(store.chatOptions[key]).toBe(false);
      },
    );
  });

  it("assembles all fields together from a realistic mixed query", () => {
    const store = storeFor({
      chzzkChannelId: "chan1",
      theme: "cute-left",
      maxChatSize: "50",
      isHidePlatformIcon: "true",
      isDisableAnimation: "true",
    });
    expect(store.chatOptions).toMatchObject({
      chzzkChannelId: "chan1",
      twitchChannel: undefined,
      youtubeHandle: undefined,
      kickChannel: undefined,
      theme: "cute-left",
      maxChatSize: 50,
      hiddenUsernameRegex: undefined,
      hiddenMessageRegex: undefined,
      soundEffectType: undefined,
      soundEffectVolume: 100,
      soundEffectCustomUrl: undefined,
      isUseOpenDcconSelector: false,
      isHidePlatformIcon: true,
      isDisableAnimation: true,
    });
  });
});
