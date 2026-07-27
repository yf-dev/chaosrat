<template>
  <div class="chat-container">
    <div class="list">
      <div v-for="chat in chatItems" :key="chat.id" class="item">
        <div class="nickname-box">
          <div class="icon-box">
            <img
              v-if="!chatOptions.isHidePlatformIcon"
              class="icon"
              :src="iconUrl(chat.platform)"
            />
            <div
              v-else
              class="icon"
              :style="{
                backgroundColor: hashToColor(hashCode(chat.nickname), 100, 70),
              }"
            />
          </div>
          <IconChevronDown
            class="chevron"
            color="#999999"
            :size="20"
            :stroke-width="1"
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
    <div class="header">
      <div class="cell">
        <IconChevronUp color="#999999" :size="20" :stroke-width="1" />
      </div>
      <div class="cell">Name</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChatItem } from "~/lib/interfaces";
import { hashCode, messageHtml, hashToColor, iconUrl } from "~/lib/utils";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-vue";

defineProps<{
  chatItems: ChatItem[];
}>();

const chatOptionsStore = useChatOptionsStore();
const { chatOptions } = storeToRefs(chatOptionsStore);
</script>

<style scoped>
.chat-container {
  /* Video-master's own tokens — scoped here on purpose (see DESIGN.md's
     per-theme-design-system principle): no other theme can reach these.
     nickname-box's own `gap: 1rem` (space between icon-box/chevron/
     badge-box/nickname) is a separate decision from the cell padding below
     even though it shares the number, so it stays a plain literal. */
  --gap: 0.6rem; /* badge-box internal gap */
  --rule: rgb(51, 51, 51); /* every divider/border line in this table layout */
  --muted-text: rgb(136, 136, 136); /* secondary text: item + header cell */
  --icon-col-width: 4rem; /* fixed icon column width, row + header */
  --cell-pad-v: 0.4rem; /* row cell vertical padding: nickname/message/header */
  --cell-pad-h: 1rem; /* row cell horizontal padding: nickname/message/header */

  position: relative;
  height: 100vh;
  width: 100vw;
  /* Keep 어절 (word) units intact; only break inside one when it can't fit.
     `anywhere`, not `break-word`: `break-word` doesn't reduce a shrink-to-fit
     box's min-content size, so `.message-cell` would overflow the table
     instead of wrapping an unbreakable run. `anywhere` does shrink
     min-content, so the cell wraps instead. */
  overflow-wrap: anywhere;
  word-break: keep-all;
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
  color: var(--muted-text);
  border-top: 1px solid var(--rule);
}

.nickname-box {
  display: flex;
  align-items: center;
  gap: 1rem;
  border-bottom: 1px solid var(--rule);
}

.icon-box {
  display: flex;
  width: var(--icon-col-width);
  flex-grow: 0;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}

.icon-box .icon {
  width: var(--chat-icon-size);
  height: var(--chat-icon-size);
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
  gap: var(--gap);
  flex-grow: 0;
  flex-shrink: 0;
}

.badge {
  width: var(--chat-icon-size);
  height: var(--chat-icon-size);
  vertical-align: middle;
}

.nickname {
  flex-grow: 1;
  font-weight: bold;
  padding: var(--cell-pad-v) var(--cell-pad-h) var(--cell-pad-v) 0;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.message {
  padding: var(--cell-pad-v) var(--cell-pad-h) var(--cell-pad-v) 9rem;
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
  padding: var(--cell-pad-v) var(--cell-pad-h);
  color: var(--muted-text);
  border-bottom: 1px solid var(--rule);
  flex-grow: 1;
}

.header .cell:first-of-type {
  flex-grow: 0;
  flex-shrink: 0;
  width: var(--icon-col-width);
  justify-content: center;
  border-right: 1px solid var(--rule);
}
</style>
