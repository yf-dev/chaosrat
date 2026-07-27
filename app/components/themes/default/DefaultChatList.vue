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
              :shadow-size="0.1"
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
          :shadow-size="0.1"
          :html="messageHtml(chat)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChatItem } from "~/lib/interfaces";
import { messageHtml, iconUrl } from "~/lib/utils";

defineProps<{
  chatItems: ChatItem[];
}>();

const chatOptionsStore = useChatOptionsStore();
const { chatOptions } = storeToRefs(chatOptionsStore);
</script>

<style scoped>
.chat-container {
  /* Default's own tokens — scoped here on purpose (see DESIGN.md's
     per-theme-design-system principle): no other theme can reach these. */
  --gap: 0.6rem; /* nickname-box / badge-box internal gap */
  --plate: rgba(0, 0, 0, 0.3); /* translucent backdrop, item + nickname-box */
  --pad: 0.8rem; /* nickname-box and message padding */

  position: relative;
  height: 100vh;
  width: 100vw;
  /* Keep 어절 (word) units intact; only break inside one when it can't fit.
     `anywhere`, not `break-word`: `break-word` doesn't reduce a shrink-to-fit
     box's min-content size, so `.nickname-box` (a flex item) would overflow
     the OBS source instead of wrapping an unbreakable run. `anywhere` does
     shrink min-content, so the box wraps instead. */
  overflow-wrap: anywhere;
  word-break: keep-all;
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
  margin: 0.8rem;
  color: rgba(255, 255, 255, 1);
}

.nickname-box {
  display: flex;
  align-items: center;
  gap: var(--gap);
  padding: var(--pad);
  background-color: var(--plate);
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

.nickname {
  font-weight: bold;
}

.message {
  padding: var(--pad);
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
