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
        <!-- eslint-disable-next-line vue/no-v-html -- messageHtml() runs the message through sanitize-html (lib/utils.ts) before emoji/sticker tags are spliced in -->
        <div class="message" v-html="messageHtml(chat)" />
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
  /* Cute's own tokens — scoped here on purpose (see DESIGN.md's
     per-theme-design-system principle): no other theme can reach these.
     .item's own margin/padding also land on 0.8rem, but that's the outer
     item margin vs. its own inner padding — separate decisions, left as
     plain literals. Likewise, the two rgba(255, 255, 255, 1) occurrences
     below (::after's paper backdrop vs. nickname-box's contrast text
     color) serve different roles and are left untokenized on purpose. */
  --gap: 0.6rem; /* nickname-box / badge-box internal gap */
  --pad: 0.8rem; /* nickname-box and message padding */

  position: relative;
  height: 100vh;
  width: 100vw;
  /* Keep 어절 (word) units intact; only break inside one when it can't fit.
     `anywhere`, not `break-word`: `break-word` doesn't reduce a shrink-to-fit
     box's min-content size, so `.item`'s `width: fit-content` bubble would
     overflow the OBS source instead of wrapping an unbreakable run.
     `anywhere` does shrink min-content, so the bubble wraps instead. */
  overflow-wrap: anywhere;
  word-break: keep-all;
  font-family: var(--font-family-display);
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
  gap: var(--gap);
  padding: var(--pad);
  color: rgba(255, 255, 255, 1);
  background-color: var(--nickname-color);
  clip-path: url(#nickname-rect);
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
}

.message {
  position: relative;
  z-index: 3;
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
