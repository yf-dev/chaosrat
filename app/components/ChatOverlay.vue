<template>
  <component
    :is="chatListComponent"
    :chatItems="processedChatItems"
  ></component>
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
import type { ChatItem } from "~/lib/interfaces";

const chatOptionsStore = useChatOptionsStore();
const { chatOptions } = storeToRefs(chatOptionsStore);

const chatListComponent = computed(() => {
  switch (chatOptions.value.theme) {
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

const soundEffectUrl = computed(() => {
  switch (chatOptions.value.soundEffectType) {
    case "beep":
      return `/sound-effects/beep.mp3`;
    case "bell":
      return `/sound-effects/bell.mp3`;
    case "pingpong-bounce":
      return `/sound-effects/pingpong-bounce.mp3`;
    case "retro-acute":
      return `/sound-effects/retro-acute.mp3`;
    case "retro-blob":
      return `/sound-effects/retro-blob.mp3`;
    case "retro-coin":
      return `/sound-effects/retro-coin.mp3`;
    case "scifi-terminal":
      return `/sound-effects/scifi-terminal.mp3`;
    case "synth-beep":
      return `/sound-effects/synth-beep.mp3`;
    case "custom":
      return chatOptions.value.soundEffectCustomUrl || null;
    case "none":
    default:
      return null;
  }
});

const hiddenUsernameRegex = computed(() => {
  if (!chatOptions.value.hiddenUsernameRegex) {
    return null;
  }
  return new RegExp(chatOptions.value.hiddenUsernameRegex);
});

const hiddenMessageRegex = computed(() => {
  if (!chatOptions.value.hiddenMessageRegex) {
    return null;
  }
  return new RegExp(chatOptions.value.hiddenMessageRegex);
});

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

function playSoundEffect() {
  if (!soundEffectUrl.value) {
    return;
  }
  const audio = new Audio(soundEffectUrl.value);
  const storedVolume = chatOptions.value.soundEffectVolume;
  const soundEffectVolume =
    typeof storedVolume === "number" && !Number.isNaN(storedVolume)
      ? storedVolume / 100
      : 1.0;
  audio.volume = soundEffectVolume;
  audio.play();
}

const { chatItems } = useChatItems({
  filter: filterChatItems,
  onNewChatItem: (chat) => {
    playSoundEffect();
  },
});

const { stickerItems } = useOpenDcconSelector();

function handleStickers(chat: ChatItem) {
  const stickers: { [key: string]: string } = {};
  for (const stickerItem of stickerItems.value) {
    if (chat.message.includes(`~${stickerItem.id}`)) {
      stickers[`~${stickerItem.id}`] = stickerItem.url;
    }
  }
  return stickers;
}

const processedChatItems = computed(() => {
  return chatItems.value.map((chat) => {
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
