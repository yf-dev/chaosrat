import { TransitionGroup } from "vue";

// The shared mechanism half of per-theme chat-list motion (the *look* is
// each theme's own CSS, added separately in that theme's own DESIGN.md and
// stylesheet -- see root DESIGN.md's Overlay Contract rule 9). Every theme
// renders its list through this composable's `listTag`/`listProps` instead
// of hardcoding `<TransitionGroup>` or `<div>` itself, and implements the
// same transition class-name contract Vue expects on the child it wraps:
// `chat-enter-from` / `chat-enter-active` / `chat-leave-to` /
// `chat-leave-active` / `chat-move`. That shared contract is what lets one
// URL option (`isDisableAnimation`) turn motion off everywhere at once.
//
// Two constraints a theme's CSS must honor, both non-obvious:
//
// 1. Enter/leave offsets must be expressed with the independent `translate:`
//    property, never `transform:`. `TransitionGroup`'s FLIP move animation
//    writes an inline `transform` on the element to reposition it, and that
//    inline style would clobber (not compose with) a `transform:` set by
//    the enter/leave classes.
// 2. Leaving items are deliberately left in flow -- no `position: absolute`,
//    unlike Vue's own docs example. Two reasons: the list is bottom-anchored
//    (`.list { position: absolute; bottom: 0 }`), so removing the top item --
//    the `maxChatSize` trim that fires on nearly every message once the list
//    is full -- never moves any remaining item on screen either way, whether
//    or not the leaving item is taken out of flow. And `position: absolute`
//    would actively misplace a leaving item in `cute`, whose `.list` is a
//    flex column: an absolutely-positioned child of a flex container takes
//    its static position from the container's alignment properties, not
//    from its in-flow slot, so it would jump to the top of the list instead
//    of fading out where it was -- and it would make `!!clear` visibly
//    collapse every message to the top before fading, rather than fading
//    each one in place. The accepted trade-off: a mid-list removal (e.g. a
//    Twitch ban/delete) closes its gap immediately instead of animating the
//    close, since the removed item still occupies flow for the duration of
//    its leave transition.
export function useChatListMotion() {
  const chatOptionsStore = useChatOptionsStore();
  const { chatOptions } = storeToRefs(chatOptionsStore);

  const isAnimated = computed(() => !chatOptions.value.isDisableAnimation);

  // When animation is off we render a plain <div> instead of a
  // <TransitionGroup>, rather than merely zeroing the durations: Vue's
  // TransitionGroup does FLIP position measurement (two
  // getBoundingClientRect reads per child, up to maxChatSize=100 children)
  // on every list update regardless of whether a transition is declared,
  // and that measurement cost is the whole reason the opt-out exists.
  const listTag = computed(() => (isAnimated.value ? TransitionGroup : "div"));
  const listProps = computed(() =>
    isAnimated.value ? { name: "chat", tag: "div" } : {},
  );

  return { isAnimated, listTag, listProps };
}
