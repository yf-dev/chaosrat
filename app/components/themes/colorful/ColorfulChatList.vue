<template>
  <div class="chat-container">
    <div class="list">
      <div v-for="chat in chatItems" :key="chat.id" class="item">
        <div
          class="nickname-box"
          :style="
            nicknameColorMap[
              Math.abs(hashCode(chat.nickname)) % nicknameColorMap.length
            ]
          "
        >
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
        <!-- eslint-disable-next-line vue/no-v-html -- messageHtml() runs the message through sanitize-html (lib/utils.ts) before emoji/sticker tags are spliced in -->
        <div class="message" v-html="messageHtml(chat)" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChatItem } from "~/lib/interfaces";
import { hashCode, messageHtml, iconUrl } from "~/lib/utils";
import type { CSSProperties } from "vue";

defineProps<{
  chatItems: ChatItem[];
}>();

const chatOptionsStore = useChatOptionsStore();
const { chatOptions } = storeToRefs(chatOptionsStore);

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
</script>

<style scoped>
.chat-container {
  /* Colorful's own tokens — scoped here on purpose (see DESIGN.md's
     per-theme-design-system principle): no other theme can reach these. */
  --gap: 0.4rem; /* nickname-box / badge-box internal gap */
  --plate: rgb(58, 58, 58); /* item card background */
  --corner: 0.4rem; /* item / nickname-box border radius */
  --pad: 0.8rem; /* item horizontal margin, nickname-box padding, message horizontal/bottom padding */

  position: relative;
  height: 100vh;
  width: 100vw;
  overflow-wrap: break-word;
  font-family: var(--font-family-display);
}
.list {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
}
.item {
  position: relative;
  background-color: var(--plate);
  margin: 1.4rem var(--pad);
  color: rgba(255, 255, 255, 1);
  transform: rotateZ(-3deg);
  transform-origin: top left;
  border-radius: var(--corner);
}

.nickname-box {
  display: flex;
  align-items: center;
  width: 80%;
  max-width: 50ch;
  gap: var(--gap);
  padding: var(--pad);
  transform: rotateZ(-2deg) translate(-0.6rem, 0.6rem);
  transform-origin: top left;
  border-radius: var(--corner);
}

.icon {
  width: var(--chat-icon-size);
  height: var(--chat-icon-size);
  vertical-align: middle;
}

.badge-box {
  display: flex;
  align-items: center;
  gap: var(--gap);
}

.badge {
  width: var(--chat-icon-size);
  height: var(--chat-icon-size);
  vertical-align: middle;
}

.message {
  padding: 1.2rem var(--pad) var(--pad);
}

.message :deep(.emoji) {
  height: var(--chat-icon-size);
  vertical-align: middle;
}

.message :deep(.sticker) {
  width: var(--chat-sticker-size);
  height: var(--chat-sticker-size);
  vertical-align: middle;
}
</style>
