<template>
  <div class="chat-container">
    <div class="list">
      <div v-for="chat in chatItems" :key="chat.id" class="item">
        <div
          class="nickname-icon"
          :style="{
            backgroundColor: hashToColor(hashCode(chat.nickname), 100, 70),
          }"
        />
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
import { hashCode, messageHtml, hashToColor } from "~/lib/utils";

defineProps<{
  chatItems: ChatItem[];
}>();
</script>

<style scoped>
.chat-container {
  /* Pure's own tokens — scoped here on purpose (see DESIGN.md's
     per-theme-design-system principle): no other theme can reach these.
     The item margin and the nickname-icon's margin-right both happen to be
     0.8rem, but one is the item's outer gutter and the other is the gap
     before the message text — separate decisions, left as plain literals. */
  --dot-size: 1.2rem; /* nickname-icon width == height */

  position: relative;
  height: 100vh;
  width: 100vw;
  /* Keep 어절 (word) units intact; only break inside one when it can't fit.
     `anywhere`, not `break-word`: `break-word` doesn't reduce a shrink-to-fit
     box's min-content size, so a long unbreakable run would overflow the OBS
     source instead of wrapping. `anywhere` does shrink min-content, so the
     box wraps instead. */
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
  margin: 0.4rem 0.8rem;
  color: rgba(255, 255, 255, 1);
  line-height: 2.5rem;
}

.nickname-icon {
  display: inline-block;
  width: var(--dot-size);
  height: var(--dot-size);
  border: 0.2rem solid rgba(0, 0, 0, 0.1);
  border-radius: 0.9rem;
  /* vertical-align: middle; */
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
