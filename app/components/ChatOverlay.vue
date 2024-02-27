<template>
  <component :is="chatListComponent" :chatItems="sortedChatItems"></component>
</template>

<script setup lang="ts">
import { DefaultChatList, ColorfulChatList } from "#components";
import { encodeFormatString } from "~/lib/utils";
import type { ChatItem } from "~/lib/interfaces";

const props = defineProps<{
  theme: string | null;
  maxChatSize: number | null;
  chzzkChannelId: string | null;
  twitchChannel: string | null;
  youtubeHandle: string | null;
  isUseOpenDcconSelector: boolean | null;
}>();
const chatListComponent = computed(() => {
  switch (props.theme) {
    case "colorful":
      return ColorfulChatList;
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
</script>
