<template>
  <div class="chat-container">
    <component :is="listTag" v-bind="listProps" class="list">
      <!-- .motion-slot exists solely so TransitionGroup's FLIP move writes
           its inline `transform: translate(0, dy)` onto an UN-rotated box.
           .item below carries `rotate: -3deg`; if it were the direct
           TransitionGroup child, that vertical dy would be applied inside
           the rotated frame and pick up a horizontal component of
           `dy * tan(3deg)` (measured previously as a real sideways swing --
           see DESIGN.md's Motion section). The wrapper carries no styling
           of its own -- see DESIGN.md for why margin collapsing and block
           sizing keep the layout identical without it. -->
      <div v-for="chat in chatItems" :key="chat.id" class="motion-slot">
        <div class="item">
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
          <!-- eslint-disable-next-line vue/no-v-html -- messageHtml() HTML-escapes the message (lib/utils.ts) before emoji/sticker tags are spliced in -->
          <div class="message" v-html="messageHtml(chat)" />
        </div>
      </div>
    </component>
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
const { listTag, listProps } = useChatListMotion();

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
  /* Keep 어절 (word) units intact; only break inside one when it can't fit.
     `anywhere`, not `break-word`: `break-word` doesn't reduce a shrink-to-fit
     box's min-content size, so the message card would overflow the OBS
     source instead of wrapping an unbreakable run. `anywhere` does shrink
     min-content, so the card wraps instead. */
  overflow-wrap: anywhere;
  word-break: keep-all;
  font-family: var(--font-family-display);

  /* Colorful's own motion tokens (see DESIGN.md's Motion section). This
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

   .item carries `rotate: -3deg`, and TransitionGroup's FLIP move writes a
   purely vertical inline `transform: translate(0, dy)` on its direct child
   to reposition a moved item -- applied inside a rotated frame, that would
   pick up a horizontal component of `dy * tan(3deg)`. That is exactly why
   `.motion-slot` (see the template) exists as an un-rotated wrapper between
   `.list` and `.item`: FLIP's inline transform lands on the slot, not on the
   tilted card, so `chat-move` below is safe to declare like every other
   theme. See DESIGN.md's Motion section for the measured before/after.

   All three classes share ONE rule, not two: TransitionGroup also applies
   `chat-move` to the *leaving* slot whenever its position also changed in
   the same update -- which is exactly what happens on a `maxChatSize` trim,
   since the bottom-anchored list shifts everything up when the new message
   that triggered the trim is inserted. `chat-move` and `chat-leave-active`
   have equal specificity, so whichever rule is written later in the
   stylesheet wins outright (the `transition` shorthand replaces, it does
   not merge) -- a separate, later `.chat-move { transition: ... }` silently
   drops the leave rule's `opacity`/`translate` transition, and the fade-out
   becomes a single-frame snap instead of an interpolation (verified:
   opacity went 1 -> 0 in one frame with the rule split, sitting at 0 for
   the rest of the duration). Listing `transform` here even though
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

/* Carries no styling of its own -- see DESIGN.md's Motion section for why
   .item's margin collapses through it (parent/child collapsing: no border,
   padding, or BFC of its own) and why the slot's block width tracks .list
   unchanged, so its only job is to be the un-rotated FLIP target. */
.motion-slot {
}

.item {
  position: relative;
  background-color: var(--plate);
  margin: 1.4rem var(--pad);
  color: rgba(255, 255, 255, 1);
  /* `rotate:` (the independent property), not `transform: rotateZ(...)`:
     .item is a TransitionGroup child, and TransitionGroup's FLIP move
     writes an inline `transform` on every repositioned child. An inline
     style beats a class rule, so a `transform:` declared here would be
     silently clobbered mid-animation and the tilt would flatten out
     during a move. `rotate:` composes with that inline `transform`
     instead of fighting it, and renders identically to the old
     `rotateZ(-3deg)` since `transform-origin` applies to `rotate:` too. */
  rotate: -3deg;
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
