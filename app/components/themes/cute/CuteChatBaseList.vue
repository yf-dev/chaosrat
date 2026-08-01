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
    <component
      :is="listTag"
      v-bind="listProps"
      class="list"
      :class="`align-${props.align}`"
    >
      <!-- .motion-slot exists solely so TransitionGroup's FLIP move writes
           its inline `transform: translate(0, dy)` onto an UN-rotated box.
           .item below carries `rotate: -1deg`; if it were the direct
           TransitionGroup child, that vertical dy would be applied inside
           the rotated frame and pick up a horizontal component of
           `dy * tan(1deg)` (measured previously as a real sideways swing --
           see DESIGN.md's Motion section). The wrapper carries no styling
           of its own -- see DESIGN.md for why flex sizing keeps the layout
           identical without it. `:key` lives here, not on `.item`, since
           the wrapper is TransitionGroup's actual direct child now. -->
      <div v-for="chat in chatItems" :key="chat.id" class="motion-slot">
        <div
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

const props = defineProps<{
  chatItems: ChatItem[];
  align: "left" | "right";
}>();

const chatOptionsStore = useChatOptionsStore();
const { chatOptions } = storeToRefs(chatOptionsStore);
const { listTag, listProps } = useChatListMotion();

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

  /* Cute's own motion tokens (see DESIGN.md's Motion section). This round
     every theme deliberately lands on the same fade+slide values -- the
     owner's explicit decision for this change, not a hint to hoist them
     into a shared token (root DESIGN.md contract rule 6/9): each theme
     keeps its own copy, scoped to its own .chat-container. */
  --motion-duration: 200ms;
  --motion-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --motion-slide: 1.2rem;
}

.list {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
}

/* Enter/leave transition contract implemented by every theme (see root
   DESIGN.md contract rule 9 and useChatListMotion.ts): a new message rises
   into place from below, a removed message continues upward as it fades.
   `translate:`, never `transform:` -- TransitionGroup's FLIP move writes an
   inline `transform` that a class-based `transform:` would fight instead
   of compose with.

   .item carries `rotate: -1deg`, and TransitionGroup's FLIP move writes a
   purely vertical inline `transform: translate(0, dy)` on its direct child
   to reposition a moved bubble -- applied inside a rotated frame, that
   would pick up a horizontal component of `dy * tan(1deg)`. That is exactly
   why `.motion-slot` (see the template) exists as an un-rotated wrapper
   between `.list` and `.item`: FLIP's inline transform lands on the slot,
   not on the tilted bubble, so `chat-move` below is safe to declare like
   every other theme. See DESIGN.md's Motion section for the measured
   before/after.

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
   .item's flex-item sizing (shrink-to-fit cross axis) is unaffected by the
   slot, so its only job is to be the un-rotated FLIP target. */
.motion-slot {
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
  /* `rotate:` (the independent property), not `transform: rotate(...)`:
     .item is a TransitionGroup child, and TransitionGroup's FLIP move
     writes an inline `transform` on every repositioned child. An inline
     style beats a class rule, so a `transform:` declared here would be
     silently clobbered mid-animation and the tilt would flatten out
     during a move. `rotate:` composes with that inline `transform`
     instead of fighting it, and renders identically to the old
     `rotate(-1deg)`. */
  rotate: -1deg;
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
