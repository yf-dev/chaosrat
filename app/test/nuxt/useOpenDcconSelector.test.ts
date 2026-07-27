import { flushPromises } from "@vue/test-utils";
import { registerEndpoint, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { createPinia, setActivePinia } from "pinia";
import { reactive } from "vue";
import type { LocationQuery, RouteLocationNormalizedLoaded } from "vue-router";

// `useOpenDcconSelector` is a thin composition of `useChatOptionsStore`
// (read via `storeToRefs`) and `useDccon`: when the store's
// `isUseOpenDcconSelector` flag and `twitchChannel` are both set, it calls
// the real `open-dccon-selector.update.sh` API to resolve a per-channel
// dccon document URL, then feeds that URL into `useDccon` (already covered
// in `useDccon.test.ts`) to get the flattened sticker list.
//
// As in `useChatOptionsStore.test.ts`, `useRoute` is mocked so tests can
// drive `route.query` directly, and a fresh Pinia is installed per test.
// Unlike that file, some tests here need the query to *change* after the
// composable is already running (to prove the internal `watch` reacts), so
// `route.query` is a `reactive()` object here rather than a plain object --
// mutating one of its properties re-triggers the store's computeds and, in
// turn, this composable's watcher.
//
// Both the selector API and the dccon document URL it returns are
// intercepted with `registerEndpoint` (confirmed in `useDccon.test.ts`'s
// header comment to work for full absolute URLs, not just relative ones).
// No test here reaches a real external URL.

function fakeRoute(query: LocationQuery): RouteLocationNormalizedLoaded {
  return { query } as unknown as RouteLocationNormalizedLoaded;
}

mockNuxtImport("useRoute", () => {
  return vi.fn(() => fakeRoute({}));
});

function storeRouteFor(query: LocationQuery) {
  setActivePinia(createPinia());
  const reactiveQuery = reactive(query);
  vi.mocked(useRoute).mockReturnValue(
    fakeRoute(reactiveQuery as LocationQuery),
  );
  return reactiveQuery;
}

const SELECTOR_URL = "https://open-dccon-selector.update.sh/api/dccon-url";

// Three separate microtask-queue drains are needed here (one more than
// `useDccon.test.ts`'s `flushFetch`), because this composable chains two
// intercepted fetches: the selector API, then the dccon document URL it
// returns. Confirmed empirically with a throwaway spike -- fewer flushes
// left `stickerItems.value` still `[]` even though both endpoint handlers
// had already been invoked.
async function flushFetch() {
  await flushPromises();
  await flushPromises();
  await flushPromises();
}

describe("useOpenDcconSelector", () => {
  describe("short-circuiting", () => {
    it("does not call the selector API when isUseOpenDcconSelector is false", async () => {
      storeRouteFor({
        isUseOpenDcconSelector: "false",
        twitchChannel: "some_channel",
      });
      const selectorHandler = vi.fn(() => ({
        user_id: "u1",
        dccon_url: "https://example.invalid/should-not-be-fetched.json",
      }));
      registerEndpoint(SELECTOR_URL, selectorHandler);

      const { stickerItems } = useOpenDcconSelector();
      await flushFetch();

      expect(selectorHandler).not.toHaveBeenCalled();
      expect(stickerItems.value).toEqual([]);
    });

    it("does not call the selector API when twitchChannel is missing, even if the flag is on", async () => {
      storeRouteFor({ isUseOpenDcconSelector: "true" });
      const selectorHandler = vi.fn(() => ({
        user_id: "u1",
        dccon_url: "https://example.invalid/should-not-be-fetched.json",
      }));
      registerEndpoint(SELECTOR_URL, selectorHandler);

      const { stickerItems } = useOpenDcconSelector();
      await flushFetch();

      expect(selectorHandler).not.toHaveBeenCalled();
      expect(stickerItems.value).toEqual([]);
    });
  });

  describe("happy path", () => {
    it("fetches the selector API with the channel name, then the returned dccon document, producing flattened stickers", async () => {
      storeRouteFor({
        isUseOpenDcconSelector: "true",
        twitchChannel: "some_channel",
      });
      const selectorHandler = vi.fn(() => ({
        user_id: "u1",
        dccon_url: "https://example.invalid/dccons.json",
      }));
      registerEndpoint(SELECTOR_URL, selectorHandler);
      registerEndpoint("https://example.invalid/dccons.json", () => ({
        dccons: [
          { keywords: ["yo"], tags: [], path: "https://cdn.example/yo.png" },
        ],
      }));

      const { stickerItems } = useOpenDcconSelector();
      await flushFetch();

      expect(selectorHandler).toHaveBeenCalledTimes(1);
      expect(stickerItems.value).toEqual([
        { id: "yo", url: "https://cdn.example/yo.png" },
      ]);
    });
  });

  describe("error handling", () => {
    it("a DcconError response ({ message }) from the selector API leaves stickerItems empty, without throwing", async () => {
      storeRouteFor({
        isUseOpenDcconSelector: "true",
        twitchChannel: "some_channel",
      });
      registerEndpoint(SELECTOR_URL, () => ({ message: "channel not found" }));

      const { stickerItems } = useOpenDcconSelector();
      await expect(flushFetch()).resolves.not.toThrow();

      expect(stickerItems.value).toEqual([]);
    });
  });

  describe("reacting to query changes", () => {
    it("starts fetching once the flag flips from off to on", async () => {
      const query = storeRouteFor({
        isUseOpenDcconSelector: "false",
        twitchChannel: "some_channel",
      });
      const selectorHandler = vi.fn(() => ({
        user_id: "u1",
        dccon_url: "https://example.invalid/dccons.json",
      }));
      registerEndpoint(SELECTOR_URL, selectorHandler);
      registerEndpoint("https://example.invalid/dccons.json", () => ({
        dccons: [
          { keywords: ["yo"], tags: [], path: "https://cdn.example/yo.png" },
        ],
      }));

      const { stickerItems } = useOpenDcconSelector();
      await flushFetch();
      expect(selectorHandler).not.toHaveBeenCalled();

      query.isUseOpenDcconSelector = "true";
      await flushFetch();

      expect(selectorHandler).toHaveBeenCalledTimes(1);
      expect(stickerItems.value).toEqual([
        { id: "yo", url: "https://cdn.example/yo.png" },
      ]);
    });
  });
});
