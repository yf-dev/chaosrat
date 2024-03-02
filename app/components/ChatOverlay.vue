<template>
  <component :is="chatListComponent" :chatItems="sortedChatItems"></component>
</template>

<script setup lang="ts">
import {
  DefaultChatList,
  ColorfulChatList,
  VideoMasterChatList,
  SimpleChatList,
  PureChatList,
} from "#components";
import { encodeFormatString } from "~/lib/utils";
import type { ChatItem, SoundEffectType } from "~/lib/interfaces";

const props = defineProps<{
  chzzkChannelId: string | null;
  twitchChannel: string | null;
  youtubeHandle: string | null;
  theme: string | null;
  maxChatSize: number | null;
  hiddenUsernameRegex: string | null;
  hiddenMessageRegex: string | null;
  soundEffectType: string | null;
  soundEffectVolume: number | null;
  isUseOpenDcconSelector: boolean | null;
}>();

const latestChatTimestamp = ref<number>(0);

const chatListComponent = computed(() => {
  switch (props.theme) {
    case "colorful":
      return ColorfulChatList;
    case "video-master":
      return VideoMasterChatList;
    case "simple":
      return SimpleChatList;
    case "pure":
      return PureChatList;
    case "default":
    default:
      return DefaultChatList;
  }
});

const maxChatSize = computed(() => {
  if (props.maxChatSize === null) {
    return 100;
  }
  return props.maxChatSize;
});

const hiddenUsernameRegex = computed(() => {
  if (props.hiddenUsernameRegex === null) {
    return null;
  }
  return new RegExp(props.hiddenUsernameRegex);
});

const hiddenMessageRegex = computed(() => {
  if (props.hiddenMessageRegex === null) {
    return null;
  }
  return new RegExp(props.hiddenMessageRegex);
});

const { chatItems: chzzkChatItems } = useChzzk(
  props.chzzkChannelId,
  maxChatSize
);

const { chatItems: twitchChatItems } = useTwitch(
  props.twitchChannel,
  maxChatSize
);

const { chatItems: youtubeLiveChatItems } = useYoutubeLive(
  props.youtubeHandle,
  maxChatSize
);

const { stickerItems } = useOpenDcconSelector(
  props.isUseOpenDcconSelector ? props.twitchChannel : null
);

function filterChatItems(chat: ChatItem): boolean {
  if (hiddenUsernameRegex.value) {
    if (hiddenUsernameRegex.value.test(chat.nickname)) {
      return false;
    }
  }
  if (hiddenMessageRegex.value) {
    if (hiddenMessageRegex.value.test(chat.message)) {
      return false;
    }
  }
  return true;
}

function handleStickers(chat: ChatItem) {
  const stickers: { [key: string]: string } = {};
  for (const stickerItem of stickerItems.value) {
    if (chat.message.includes(`~${stickerItem.id}`)) {
      stickers[`~${stickerItem.id}`] = stickerItem.url;
    }
  }
  return stickers;
}

const sortedChatItems = computed(() => {
  return [
    ...chzzkChatItems.value,
    ...twitchChatItems.value,
    ...youtubeLiveChatItems.value,
  ]
    .sort((a, b) => a.timestamp - b.timestamp)
    .filter(filterChatItems)
    .slice(-maxChatSize.value)
    .map((chat) => {
      const stickers = handleStickers(chat);

      const newChat = { ...chat, extra: { ...chat.extra, stickers } };

      const encodeTargets = {
        ...newChat.extra.emojis,
        ...newChat.extra.stickers,
      };
      const { message: newMessage, targets: newTargets } = encodeFormatString(
        newChat.message,
        Object.keys(encodeTargets)
      );

      const newEmojis: { [key: string]: string } = {};
      if (newChat.extra.emojis) {
        const oldEmojis = newChat.extra.emojis;
        Object.keys(oldEmojis).forEach((key) => {
          if (key in newTargets) {
            newEmojis[newTargets[key]] = oldEmojis[key];
          }
        });
      }

      const newStickers: { [key: string]: string } = {};
      if (newChat.extra.stickers) {
        const oldStickers = newChat.extra.stickers;
        Object.keys(oldStickers).forEach((key) => {
          if (key in newTargets) {
            newStickers[newTargets[key]] = oldStickers[key];
          }
        });
      }

      return {
        ...newChat,
        message: newMessage,
        extra: {
          ...newChat.extra,
          emojis: newEmojis,
          stickers: newStickers,
        },
      };
    });
});

function playSoundEffect() {
  let soundEffect: SoundEffectType = "none";
  if (props.soundEffectType === "default") {
    soundEffect = "default";
  }
  if (soundEffect === "none") {
    return;
  }
  const audio = new Audio(`/sound-effects/${props.soundEffectType}.mp3`);
  audio.volume =
    props.soundEffectVolume === null ? 1.0 : props.soundEffectVolume / 100;
  audio.play();
}

watch(
  () => sortedChatItems.value,
  (items) => {
    if (items.length === 0) {
      return;
    }
    const lastItem = items[items.length - 1];
    if (lastItem.timestamp > latestChatTimestamp.value) {
      latestChatTimestamp.value = lastItem.timestamp;
      playSoundEffect();
    }
  },
  { immediate: true }
);
</script>
