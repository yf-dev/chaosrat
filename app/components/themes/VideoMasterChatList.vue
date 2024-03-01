<template>
  <div class="chat-container">
    <div class="list">
      <div v-for="chat in chatItems" :key="chat.id" class="item">
        <div class="nickname-box">
          <div class="icon-box">
            <img class="icon" :src="iconUrl(chat.platform)" />
          </div>
          <IconChevronDown
            class="chevron"
            color="#999999"
            :size="20"
            :strokeWidth="1"
          />
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
    <div class="header">
      <div class="cell">
        <IconChevronUp color="#999999" :size="20" :strokeWidth="1" />
      </div>
      <div class="cell">Name</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChatItem, ChatPlatform } from "~/lib/interfaces";
import { messageHtml } from "~/lib/utils";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-vue";

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
  background-color: rgb(29, 29, 29);
}
.list {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
}
.item {
  position: relative;
  color: rgb(136, 136, 136);
  border-top: 1px solid rgb(51, 51, 51);
}

.nickname-box {
  display: flex;
  align-items: center;
  gap: 1rem;
  border-bottom: 1px solid rgb(51, 51, 51);
}

.icon-box {
  display: flex;
  width: 4rem;
  flex-grow: 0;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}

.icon-box .icon {
  width: 1.8rem;
  height: 1.8rem;
  vertical-align: middle;
}

.chevron {
  width: 2rem;
  flex-grow: 0;
  flex-shrink: 0;
}

.badge-box {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-grow: 0;
  flex-shrink: 0;
}

.badge {
  width: 1.8rem;
  height: 1.8rem;
  vertical-align: middle;
}

.nickname {
  flex-grow: 1;
  font-weight: bold;
  padding: 0.4rem 1rem 0.4rem 0;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.message {
  padding: 0.4rem 1rem 0.4rem 9rem;
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

.header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  background-color: rgb(38, 38, 38);
  align-items: stretch;
  font-weight: bold;
}

.header .cell {
  display: flex;
  align-items: center;
  padding: 0.4rem 1rem;
  color: rgb(136, 136, 136);
  border-bottom: 1px solid rgb(51, 51, 51);
  flex-grow: 1;
}

.header .cell:first-of-type {
  flex-grow: 0;
  flex-shrink: 0;
  width: 4rem;
  justify-content: center;
  border-right: 1px solid rgb(51, 51, 51);
}
</style>
