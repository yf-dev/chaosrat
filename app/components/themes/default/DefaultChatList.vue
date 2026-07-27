<template>
  <div class="chat-container">
    <component :is="listTag" v-bind="listProps" class="list">
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
    </component>
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
const { listTag, listProps } = useChatListMotion();
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

  /* Default's own motion tokens (see DESIGN.md's Motion section). This
     round every theme deliberately lands on the same fade+slide values --
     the owner's explicit decision for this change, not a hint to hoist
     them into a shared token (root DESIGN.md contract rule 6/9): each
     theme keeps its own copy, scoped to its own .chat-container. */
  --motion-duration: 200ms;
  --motion-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --motion-slide: 1.2rem;
}
.list {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
}

/* Enter/leave transition contract implemented by every theme (see root
   DESIGN.md contract rule 9 and useChatListMotion.ts): a new message rises
   into place from below, a removed message continues upward as it fades.
   `translate:`, never `transform:` -- TransitionGroup's FLIP move writes an
   inline `transform` that a class-based `transform:` would fight instead
   of compose with.

   All three classes share ONE rule, not two: TransitionGroup also applies
   `chat-move` to a *leaving* element whenever that element's position also
   changed in the same update -- which is exactly what happens on a
   `maxChatSize` trim, since the bottom-anchored list shifts everything up
   when the new message that triggered the trim is inserted. `chat-move` and
   `chat-leave-active` have equal specificity, so whichever rule is written
   later in the stylesheet wins outright (the `transition` shorthand
   replaces, it does not merge) -- a separate, later `.chat-move { transition:
   ... }` silently drops the leave rule's `opacity`/`translate` transition,
   and the fade-out becomes a single-frame snap instead of an interpolation
   (verified: opacity went 1 -> 0 in one frame with the rule split, sitting
   at 0 for the rest of the duration). Listing `transform` here even though
   `.chat-enter-active`/`.chat-leave-active` alone never receive an inline
   `transform` costs nothing. */
.chat-enter-active,
.chat-leave-active,
.chat-move {
  transition:
    opacity var(--motion-duration) var(--motion-ease),
    translate var(--motion-duration) var(--motion-ease),
    transform var(--motion-duration) var(--motion-ease);
}
.chat-enter-from {
  opacity: 0;
  translate: 0 var(--motion-slide);
}
.chat-leave-to {
  opacity: 0;
  translate: 0 calc(-1 * var(--motion-slide));
}

@media (prefers-reduced-motion: reduce) {
  .chat-enter-active,
  .chat-leave-active,
  .chat-move {
    transition-duration: 1ms;
  }
  .chat-enter-from,
  .chat-leave-to {
    translate: none;
  }
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
