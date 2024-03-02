<template>
  <div class="chat-container">
    <div class="list">
      <div v-for="chat in chatItems" :key="chat.id" class="item">
        <div class="nickname-box">
          <img class="icon" :src="iconUrl(chat.platform)" />
          <img
            v-for="(url, badgeId) in chat.extra.badges ?? {}"
            :key="badgeId"
            class="badge"
            :src="url"
          />
          <div class="nickname">
            <TextWithShadow
              :shadowSize="0.1"
              :style="{
                display: 'inline',
                color: hashToColor(hashCode(chat.nickname), 100, 70),
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
import { hashCode, messageHtml, hashToColor } from "~/lib/utils";

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
  margin: 0.4rem 0.8rem;
  color: rgba(255, 255, 255, 1);
  line-height: 2.5rem;
}

.nickname-box {
  display: inline;
}

.icon {
  display: inline-block;
  width: 1.8rem;
  height: 1.8rem;
  vertical-align: middle;
  margin-right: 0.4rem;
  margin-bottom: 0.2rem;
}

.badge {
  display: inline-block;
  width: 1.8rem;
  height: 1.8rem;
  vertical-align: middle;
  margin-right: 0.4rem;
  margin-bottom: 0.2rem;
}

.nickname {
  display: inline-block;
  font-weight: bold;
  margin-right: 0.8rem;
}

.message {
  display: inline;
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
