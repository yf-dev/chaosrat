import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { createPinia, setActivePinia } from "pinia";
import { TransitionGroup } from "vue";
import type { LocationQuery, RouteLocationNormalizedLoaded } from "vue-router";

// `useChatListMotion` is the shared mechanism half of the per-theme motion
// feature: it decides whether the list should render through Vue's
// `TransitionGroup` (animated) or a plain `div` (animation disabled), based
// on the `isDisableAnimation` URL option read from `useChatOptionsStore`.
//
// As in `useChatOptionsStore.test.ts` / `useOpenDcconSelector.test.ts`,
// `useRoute` is mocked so tests can drive `route.query` directly against a
// fresh Pinia per test, exercising the real store rather than a hand-rolled
// mock of it.

function fakeRoute(query: LocationQuery): RouteLocationNormalizedLoaded {
  return { query } as unknown as RouteLocationNormalizedLoaded;
}

mockNuxtImport("useRoute", () => {
  return vi.fn(() => fakeRoute({}));
});

function storeRouteFor(query: LocationQuery) {
  setActivePinia(createPinia());
  vi.mocked(useRoute).mockReturnValue(fakeRoute(query));
}

describe("useChatListMotion", () => {
  it("is animated by default when isDisableAnimation is unset", () => {
    storeRouteFor({});

    const { isAnimated, listTag, listProps } = useChatListMotion();

    expect(isAnimated.value).toBe(true);
    expect(listTag.value).toBe(TransitionGroup);
    expect(listProps.value).toEqual({ name: "chat", tag: "div" });
  });

  it("is animated when isDisableAnimation is explicitly false", () => {
    storeRouteFor({ isDisableAnimation: "false" });

    const { isAnimated, listTag, listProps } = useChatListMotion();

    expect(isAnimated.value).toBe(true);
    expect(listTag.value).toBe(TransitionGroup);
    expect(listProps.value).toEqual({ name: "chat", tag: "div" });
  });

  it("disables animation when isDisableAnimation is true, rendering a plain div", () => {
    storeRouteFor({ isDisableAnimation: "true" });

    const { isAnimated, listTag, listProps } = useChatListMotion();

    expect(isAnimated.value).toBe(false);
    expect(listTag.value).toBe("div");
    expect(listProps.value).toEqual({});
  });
});
