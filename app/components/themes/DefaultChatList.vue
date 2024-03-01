<template>
  <div class="chat-container">
    <div class="list">
      <div v-for="chat in chatItems" :key="chat.id" class="item">
        <div class="nickname-box">
          <img class="icon" :src="iconUrl(chat.platform)" />
          <div
            v-if="Object.keys(chat.extra.badges ?? {}).length > 0"
            class="badge-box"
          >
            <img
              v-for="(url, badgeId) in chat.extra.badges ?? {}"
              :key="badgeId"
              class="badge"
              :src="url"
            />
          </div>
          <div class="nickname">
            <TextWithShadow
              :shadowSize="0.1"
              :style="{
                display: 'inline',
              }"
            >
              {{ chat.nickname }}
            </TextWithShadow>
          </div>
        </div>
        <TextWithShadow
          class="message"
          :shadowSize="0.1"
          v-html="messageHtml(chat, emojiToTag, stickerToTag)"
        ></TextWithShadow>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChatItem, ChatPlatform } from "~/lib/interfaces";
import { messageHtml } from "~/lib/utils";

defineProps<{
  chatItems: ChatItem[];
}>();

function iconUrl(platform: ChatPlatform): string {
  switch (platform) {
    case "chzzk":
      return "/chzzk.png";
    case "twitch":
      return "/twitch.png";
    case "youtube-live":
      return "/youtube.png";
    default:
      return "";
  }
}

function emojiToTag(emojiUrl: string): string {
  return `<img class="emoji" src="${emojiUrl}" />`;
}

function stickerToTag(stickerUrl: string): string {
  return `<img class="sticker" src="${stickerUrl}" />`;
}
</script>

<style scoped>
.chat-container {
  position: relative;
  height: 100vh;
  width: 100vw;
}
.list {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
}
.item {
  position: relative;
  background-color: rgba(0, 0, 0, 0.3);
  margin: 0.8rem;
  color: rgba(255, 255, 255, 1);
}

.nickname-box {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.8rem;
  background-color: rgba(0, 0, 0, 0.3);
}

.icon {
  width: 1.8rem;
  height: 1.8rem;
  vertical-align: middle;
}

.badge-box {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.badge {
  width: 1.8rem;
  height: 1.8rem;
  vertical-align: middle;
}

.nickname {
  font-weight: bold;
}

.message {
  padding: 0.8rem;
}

.message :deep(.emoji) {
  height: 1.8rem;
  vertical-align: middle;
}

.message :deep(.sticker) {
  width: 10rem;
  height: 10rem;
  vertical-align: middle;
}
</style>
