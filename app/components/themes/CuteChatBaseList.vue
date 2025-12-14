<template>
  <div class="chat-container">
    <!-- SVG clipPath for hand-drawn effect -->
    <svg style="position: absolute; width: 0; height: 0">
      <defs>
        <clipPath id="item-rect" clipPathUnits="objectBoundingBox">
          <path
            d="M 0.005 0.05 Q 0.0582 0.0047 0.995 0.05 Q 1.0036 0.6604 0.995 0.95 Q 0.0836 0.9826 0.005 0.95 Q -0.0047 0.1812 0.005 0.05 Z"
          />
        </clipPath>
        <clipPath id="nickname-rect" clipPathUnits="objectBoundingBox">
          <path
            d="M 0.005 0.05 Q 0.8697 -0.0429 0.995 0.05 Q 1.0042 0.4865 0.995 0.95 Q 0.3375 1.0389 0.005 0.95 Q -0.0047 0.1812 0.005 0.05 Z"
          />
        </clipPath>
      </defs>
    </svg>
    <div class="list" :class="`align-${props.align}`">
      <div
        v-for="chat in chatItems"
        :key="chat.id"
        class="item"
        :style="{
          '--nickname-color': idToColor(Math.abs(hashCode(chat.id))),
        }"
      >
        <div class="nickname-box">
          <img
            v-if="!chatOptions.isHidePlatformIcon"
            class="icon"
            :src="iconUrl(chat.platform)"
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
        <div class="message" v-html="messageHtml(chat)"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChatItem } from "~/lib/interfaces";
import { hashCode, messageHtml, iconUrl } from "~/lib/utils";

const props = defineProps<{
  chatItems: ChatItem[];
  align: "left" | "right";
}>();

const chatOptionsStore = useChatOptionsStore();
const { chatOptions } = storeToRefs(chatOptionsStore);

const idToColor = function (index: number) {
  const hue = index % 360;
  return `oklch(77% 0.08 ${hue})`;
};
</script>

<style scoped>
.chat-container {
  position: relative;
  height: 100vh;
  width: 100vw;
  overflow-wrap: break-word;
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
  display: flex;
  flex-direction: column;
}

.list.align-left {
  align-items: flex-start;
}

.list.align-right {
  align-items: flex-end;
}

.item {
  position: relative;
  margin: 0.4rem 0.8rem;
  color: rgba(0, 0, 0, 1);
  padding: 1rem 0.8rem;
  z-index: 0;
  width: fit-content;
  max-width: 100%;
  transform: rotate(-1deg);
}

.item::before {
  content: "";
  position: absolute;
  inset: -0.3rem;
  background: var(--nickname-color);
  clip-path: url(#item-rect);
  z-index: 1;
}

.item::after {
  content: "";
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 1);
  clip-path: url(#item-rect);
  z-index: 2;
}

.nickname-box {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.8rem;
  color: rgba(255, 255, 255, 1);
  background-color: var(--nickname-color);
  clip-path: url(#nickname-rect);
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
}

.message {
  position: relative;
  z-index: 3;
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
