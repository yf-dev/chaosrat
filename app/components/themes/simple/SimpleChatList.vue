<template>
  <div class="chat-container">
    <div class="list">
      <div v-for="chat in chatItems" :key="chat.id" class="item">
        <div class="nickname-box">
          <img
            v-if="!chatOptions.isHidePlatformIcon"
            class="icon"
            :src="iconUrl(chat.platform)"
          />
          <img
            v-for="(url, badgeId) in chat.extra.badges ?? {}"
            :key="badgeId"
            class="badge"
            :src="url"
          />
          <div class="nickname">
            <TextWithShadow
              :shadow-size="0.1"
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
          :shadow-size="0.1"
          :html="messageHtml(chat)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChatItem } from "~/lib/interfaces";
import { hashCode, messageHtml, hashToColor, iconUrl } from "~/lib/utils";

defineProps<{
  chatItems: ChatItem[];
}>();

const chatOptionsStore = useChatOptionsStore();
const { chatOptions } = storeToRefs(chatOptionsStore);
</script>

<style scoped>
.chat-container {
  /* Simple's own tokens — scoped here on purpose (see DESIGN.md's
     per-theme-design-system principle): no other theme can reach these.
     Only the icon/badge inline spacing repeats within this theme (both
     render identically inline before the nickname); the item margin and
     nickname's own margin-right happen to share these numbers but are
     separate layout decisions, so they stay as plain literals below. */
  --gap: 0.4rem; /* icon/badge margin-right before following inline content */
  --nudge: 0.2rem; /* icon/badge margin-bottom baseline nudge */

  position: relative;
  height: 100vh;
  width: 100vw;
  overflow-wrap: break-word;
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
  width: var(--chat-icon-size);
  height: var(--chat-icon-size);
  vertical-align: middle;
  margin-right: var(--gap);
  margin-bottom: var(--nudge);
}

.badge {
  display: inline-block;
  width: var(--chat-icon-size);
  height: var(--chat-icon-size);
  vertical-align: middle;
  margin-right: var(--gap);
  margin-bottom: var(--nudge);
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
  height: var(--chat-icon-size);
  vertical-align: middle;
}

.message :deep(.sticker) {
  width: var(--chat-sticker-size);
  height: var(--chat-sticker-size);
  vertical-align: middle;
}
</style>
