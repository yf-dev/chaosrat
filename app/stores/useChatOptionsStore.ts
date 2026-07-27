import type { ChatOptions, ChatTheme, SoundEffectType } from "~/lib/interfaces";
import { decodeUrlSafeBase64, parseIntOrDefault } from "~/lib/utils";

// The URL builder (`pages/index.vue`) only ever emits a boolean flag by
// setting it to the literal string "true", or by omitting the key entirely
// when it's off -- it never writes "false". So for builder-generated URLs,
// "missing" and "true" are the only shapes that matter, and both must keep
// working exactly as before. This also treats a hand-written `=false` or
// `=0` as false (previously `!!"false"` was `true`, the actual defect), and
// any other non-empty string (including a bare `?flag` with no value, which
// vue-router reports as `null`) falls back to the pre-existing "truthy
// string wins" behaviour.
function parseBooleanFlag(value: string | null | undefined): boolean {
  if (value === "false" || value === "0") {
    return false;
  }
  return !!value;
}

// `decodeUrlSafeBase64` never throws on malformed base64 -- it just returns
// a garbled string. That garbled string (or a validly-decoded but
// syntactically invalid regex source) used to flow straight through to
// `ChatOverlay.vue`'s `new RegExp(...)`, which has no try/catch, crashing
// the overlay on mount. Validate here, at the boundary where untrusted URL
// input enters the app, so any consumer can safely treat `undefined` as "no
// filter".
function decodeValidRegexSource(value: string): string | undefined {
  const decoded = decodeUrlSafeBase64(value);
  try {
    new RegExp(decoded);
  } catch {
    return undefined;
  }
  return decoded;
}

export const useChatOptionsStore = defineStore("chatOptions", () => {
  const route = useRoute();

  const chzzkChannelId = computed<string | undefined>(() => {
    if (Array.isArray(route.query.chzzkChannelId)) {
      return route.query.chzzkChannelId[0] ?? undefined;
    }
    return route.query.chzzkChannelId ?? undefined;
  });

  const twitchChannel = computed<string | undefined>(() => {
    if (Array.isArray(route.query.twitchChannel)) {
      return route.query.twitchChannel[0] ?? undefined;
    }
    return route.query.twitchChannel ?? undefined;
  });

  const youtubeHandle = computed<string | undefined>(() => {
    if (Array.isArray(route.query.youtubeHandle)) {
      return route.query.youtubeHandle[0] ?? undefined;
    }
    return route.query.youtubeHandle ?? undefined;
  });

  const kickChannel = computed<string | undefined>(() => {
    if (Array.isArray(route.query.kickChannel)) {
      return route.query.kickChannel[0] ?? undefined;
    }
    return route.query.kickChannel ?? undefined;
  });

  const theme = computed<ChatTheme | undefined>(() => {
    const themeValue = Array.isArray(route.query.theme)
      ? route.query.theme[0]
      : route.query.theme;
    switch (themeValue) {
      case "colorful":
      case "video-master":
      case "simple":
      case "pure":
      case "cute-left":
      case "cute-right":
      case "default":
        return themeValue;
      default:
        return undefined;
    }
  });

  const maxChatSize = computed<number | undefined>(() => {
    if (Array.isArray(route.query.maxChatSize)) {
      if (route.query.maxChatSize[0] === null) {
        return undefined;
      }
      return parseIntOrDefault(route.query.maxChatSize[0], 10, 100);
    }
    if (route.query.maxChatSize === null) {
      return undefined;
    }
    return parseIntOrDefault(route.query.maxChatSize, 10, 100);
  });

  const hiddenUsernameRegex = computed<string | undefined>(() => {
    if (Array.isArray(route.query.hiddenUsernameRegex)) {
      if (!route.query.hiddenUsernameRegex[0]) {
        return undefined;
      }
      return decodeValidRegexSource(route.query.hiddenUsernameRegex[0]);
    }
    if (!route.query.hiddenUsernameRegex) {
      return undefined;
    }
    return decodeValidRegexSource(route.query.hiddenUsernameRegex);
  });

  const hiddenMessageRegex = computed<string | undefined>(() => {
    if (Array.isArray(route.query.hiddenMessageRegex)) {
      if (!route.query.hiddenMessageRegex[0]) {
        return undefined;
      }
      return decodeValidRegexSource(route.query.hiddenMessageRegex[0]);
    }
    if (!route.query.hiddenMessageRegex) {
      return undefined;
    }
    return decodeValidRegexSource(route.query.hiddenMessageRegex);
  });

  const soundEffectType = computed<SoundEffectType | undefined>(() => {
    const soundEffectTypeValue = Array.isArray(route.query.soundEffectType)
      ? route.query.soundEffectType[0]
      : route.query.soundEffectType;
    switch (soundEffectTypeValue) {
      case "beep":
      case "bell":
      case "pingpong-bounce":
      case "retro-acute":
      case "retro-blob":
      case "retro-coin":
      case "scifi-terminal":
      case "synth-beep":
      case "custom":
      case "none":
        return soundEffectTypeValue;
      default:
        return undefined;
    }
  });

  const soundEffectVolume = computed<number | undefined>(() => {
    if (Array.isArray(route.query.soundEffectVolume)) {
      if (route.query.soundEffectVolume[0] === null) {
        return undefined;
      }
      return parseIntOrDefault(route.query.soundEffectVolume[0], 10, 100);
    }
    if (route.query.soundEffectVolume === null) {
      return undefined;
    }
    return parseIntOrDefault(route.query.soundEffectVolume, 10, 100);
  });

  const soundEffectCustomUrl = computed<string | undefined>(() => {
    if (Array.isArray(route.query.soundEffectCustomUrl)) {
      return route.query.soundEffectCustomUrl[0] ?? undefined;
    }
    return route.query.soundEffectCustomUrl ?? undefined;
  });

  const isUseOpenDcconSelector = computed<boolean | undefined>(() => {
    if (Array.isArray(route.query.isUseOpenDcconSelector)) {
      return parseBooleanFlag(route.query.isUseOpenDcconSelector[0]);
    }
    return parseBooleanFlag(route.query.isUseOpenDcconSelector);
  });

  const isHidePlatformIcon = computed<boolean | undefined>(() => {
    if (Array.isArray(route.query.isHidePlatformIcon)) {
      return parseBooleanFlag(route.query.isHidePlatformIcon[0]);
    }
    return parseBooleanFlag(route.query.isHidePlatformIcon);
  });

  const chatOptions = ref<ChatOptions>({
    chzzkChannelId: chzzkChannelId.value,
    twitchChannel: twitchChannel.value,
    youtubeHandle: youtubeHandle.value,
    kickChannel: kickChannel.value,
    theme: theme.value,
    maxChatSize: maxChatSize.value,
    hiddenUsernameRegex: hiddenUsernameRegex.value,
    hiddenMessageRegex: hiddenMessageRegex.value,
    soundEffectType: soundEffectType.value,
    soundEffectVolume: soundEffectVolume.value,
    soundEffectCustomUrl: soundEffectCustomUrl.value,
    isUseOpenDcconSelector: isUseOpenDcconSelector.value,
    isHidePlatformIcon: isHidePlatformIcon.value,
  });

  watch(
    () => ({
      chzzkChannelId: chzzkChannelId.value,
      twitchChannel: twitchChannel.value,
      youtubeHandle: youtubeHandle.value,
      kickChannel: kickChannel.value,
      theme: theme.value,
      maxChatSize: maxChatSize.value,
      hiddenUsernameRegex: hiddenUsernameRegex.value,
      hiddenMessageRegex: hiddenMessageRegex.value,
      soundEffectType: soundEffectType.value,
      soundEffectVolume: soundEffectVolume.value,
      soundEffectCustomUrl: soundEffectCustomUrl.value,
      isUseOpenDcconSelector: isUseOpenDcconSelector.value,
      isHidePlatformIcon: isHidePlatformIcon.value,
    }),
    (val) => {
      chatOptions.value = val;
    },
    { immediate: true },
  );

  return { chatOptions };
});
