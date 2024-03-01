<template>
  <div class="chat-container">
    <div class="list">
      <div v-for="(chat, index) in chatItems" :key="chat.id" class="item">
        <div
          class="nickname-box"
          :style="
            nicknameColorMap[
              Math.abs(hashCode(chat.nickname)) % nicknameColorMap.length
            ]
          "
        >
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
            {{ chat.nickname }}
          </div>
        </div>
        <div
          class="message"
          v-html="messageHtml(chat, emojiToTag, stickerToTag)"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChatItem, ChatPlatform } from "~/lib/interfaces";
import { hashCode, messageHtml } from "~/lib/utils";
import type { CSSProperties } from "vue";

defineProps<{
  chatItems: ChatItem[];
}>();

const nicknameColorMap: CSSProperties[] = [
  {
    color: "rgb(0, 0, 0)",
    backgroundColor: "rgb(218, 229, 0)",
  },
  {
    color: "rgb(0, 0, 0)",
    backgroundColor: "rgb(147 132 254)",
  },
  {
    color: "rgb(0, 0, 0)",
    backgroundColor: "rgb(255, 115, 0)",
  },
  {
    color: "rgb(0, 0, 0)",
    backgroundColor: "rgb(219 92 255)",
  },
];

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
  font-family: "ONE-Mobile-POP", "Pretendard Variable", Pretendard,
    -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Helvetica Neue",
    "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic",
    "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif;
}
.list {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
}
.item {
  position: relative;
  background-color: rgb(58, 58, 58);
  margin: 1.4rem 0.8rem;
  color: rgba(255, 255, 255, 1);
  transform: rotateZ(-3deg);
  transform-origin: top left;
  border-radius: 0.4rem;
}

.nickname-box {
  display: flex;
  align-items: center;
  width: 80%;
  max-width: 50ch;
  gap: 0.4rem;
  padding: 0.8rem;
  transform: rotateZ(-2deg) translate(-0.6rem, 0.6rem);
  transform-origin: top left;
  border-radius: 0.4rem;
}

.icon {
  width: 1.8rem;
  height: 1.8rem;
  vertical-align: middle;
}

.badge-box {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.badge {
  width: 1.8rem;
  height: 1.8rem;
  vertical-align: middle;
}

.nickname {
}

.message {
  padding: 1.2rem 0.8rem 0.8rem;
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
