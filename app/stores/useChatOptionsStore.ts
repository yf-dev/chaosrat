import type { ChatOptions, ChatTheme, SoundEffectType } from "~/lib/interfaces";
import { decodeUrlSafeBase64 } from "~/lib/utils";

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

  const theme = computed<ChatTheme | undefined>(() => {
    const themeValue = Array.isArray(route.query.theme)
      ? route.query.theme[0]
      : route.query.theme;
    switch (themeValue) {
      case "colorful":
      case "video-master":
      case "simple":
      case "pure":
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
      return Number.parseInt(route.query.maxChatSize[0], 10);
    }
    if (route.query.maxChatSize === null) {
      return undefined;
    }
    return Number.parseInt(route.query.maxChatSize, 10);
  });

  const hiddenUsernameRegex = computed<string | undefined>(() => {
    if (Array.isArray(route.query.hiddenUsernameRegex)) {
      if (!route.query.hiddenUsernameRegex[0]) {
        return undefined;
      }
      return decodeUrlSafeBase64(route.query.hiddenUsernameRegex[0]);
    }
    if (!route.query.hiddenUsernameRegex) {
      return undefined;
    }
    return decodeUrlSafeBase64(route.query.hiddenUsernameRegex);
  });

  const hiddenMessageRegex = computed<string | undefined>(() => {
    if (Array.isArray(route.query.hiddenMessageRegex)) {
      if (!route.query.hiddenMessageRegex[0]) {
        return undefined;
      }
      return decodeUrlSafeBase64(route.query.hiddenMessageRegex[0]);
    }
    if (!route.query.hiddenMessageRegex) {
      return undefined;
    }
    return decodeUrlSafeBase64(route.query.hiddenMessageRegex);
  });

  const soundEffectType = computed<SoundEffectType | undefined>(() => {
    const soundEffectTypeValue = Array.isArray(route.query.soundEffectType)
      ? route.query.soundEffectType[0]
      : route.query.soundEffectType;
    switch (soundEffectTypeValue) {
      case "default":
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
      return Number.parseInt(route.query.soundEffectVolume[0], 10);
    }
    if (route.query.soundEffectVolume === null) {
      return undefined;
    }
    return Number.parseInt(route.query.soundEffectVolume, 10);
  });

  const isUseOpenDcconSelector = computed<boolean | undefined>(() => {
    if (Array.isArray(route.query.isUseOpenDcconSelector)) {
      return !!route.query.isUseOpenDcconSelector[0];
    }
    return !!route.query.isUseOpenDcconSelector;
  });

  const isHidePlatformIcon = computed<boolean | undefined>(() => {
    if (Array.isArray(route.query.isHidePlatformIcon)) {
      return !!route.query.isHidePlatformIcon[0];
    }
    return !!route.query.isHidePlatformIcon;
  });

  const chatOptions = ref<ChatOptions>({
    chzzkChannelId: chzzkChannelId.value,
    twitchChannel: twitchChannel.value,
    youtubeHandle: youtubeHandle.value,
    theme: theme.value,
    maxChatSize: maxChatSize.value,
    hiddenUsernameRegex: hiddenUsernameRegex.value,
    hiddenMessageRegex: hiddenMessageRegex.value,
    soundEffectType: soundEffectType.value,
    soundEffectVolume: soundEffectVolume.value,
    isUseOpenDcconSelector: isUseOpenDcconSelector.value,
    isHidePlatformIcon: isHidePlatformIcon.value,
  });

  watch(
    () => ({
      chzzkChannelId: chzzkChannelId.value,
      twitchChannel: twitchChannel.value,
      youtubeHandle: youtubeHandle.value,
      theme: theme.value,
      maxChatSize: maxChatSize.value,
      hiddenUsernameRegex: hiddenUsernameRegex.value,
      hiddenMessageRegex: hiddenMessageRegex.value,
      soundEffectType: soundEffectType.value,
      soundEffectVolume: soundEffectVolume.value,
      isUseOpenDcconSelector: isUseOpenDcconSelector.value,
      isHidePlatformIcon: isHidePlatformIcon.value,
    }),
    (val) => {
      chatOptions.value = val;
    },
    { immediate: true }
  );

  return { chatOptions };
});