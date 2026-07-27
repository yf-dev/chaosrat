import { flushPromises } from "@vue/test-utils";
import { registerEndpoint } from "@nuxt/test-utils/runtime";
import { ref } from "vue";
import type { DcconData } from "~/lib/interfaces";

// `useDccon(dcconUrl)` `$fetch`es a user-supplied JSON document (the URL
// comes from the overlay's query string, so from the app's point of view
// this document is attacker-influenced) and flattens `dccons[].keywords[]`
// into a flat `StickerItem[]` list, sorted so longer keywords are matched
// first by the caller (`ChatOverlay.vue` does `message.includes("~" + id)`,
// so "hello" must be tried before "hi" or the shorter keyword would always
// win first).
//
// The fetch is intercepted with `registerEndpoint`, which (confirmed by a
// throwaway spike, not just read from source) intercepts `$fetch` calls to
// full absolute external URLs -- not just relative Nitro-style endpoints --
// because `@nuxt/test-utils`'s vitest environment rewrites any URL that
// matches a registered key to `/_<url>` and routes it through an in-process
// h3 app instead of a real network call. No test here ever reaches a real
// external URL.
//
// Timing: `useDccon`'s internal `watch(..., { immediate: true })` starts the
// `$fetch` synchronously but the composable itself never awaits it, so
// nothing here can `await` a return value from `useDccon(...)` directly.
// One `flushPromises()` is needed to let the intercepted fetch's promise
// chain settle, and a second is needed for `dcconData.value = data` and the
// dependent `stickerItems` computed to actually flush -- confirmed
// empirically; a single flush leaves `stickerItems.value` still `[]`.
async function flushFetch() {
  await flushPromises();
  await flushPromises();
}

describe("useDccon", () => {
  describe("keyword flattening", () => {
    it("flattens multiple keywords per dccon to the same path, and sorts longer keywords first", async () => {
      const fixture: DcconData = {
        dccons: [
          {
            keywords: ["hi", "hello"],
            tags: ["greeting"],
            path: "https://cdn.example/a.png",
          },
        ],
      };
      registerEndpoint("https://example.invalid/dccons-a.json", () => fixture);

      const { stickerItems } = useDccon(
        ref<string | null>("https://example.invalid/dccons-a.json"),
      );
      await flushFetch();

      // "hello" (5 chars) must sort before "hi" (2 chars) even though it
      // was declared second, and both share the same dccon's path.
      expect(stickerItems.value).toEqual([
        { id: "hello", url: "https://cdn.example/a.png" },
        { id: "hi", url: "https://cdn.example/a.png" },
      ]);
    });

    // `useDccon` does not de-duplicate by keyword: if two different dccon
    // entries declare the same keyword, both survive into `stickerItems` as
    // separate entries (same `id`, different `url`). The stable sort keeps
    // same-length ids in their original relative (declaration) order, so
    // the *first*-declared entry for a duplicate keyword comes first in the
    // array. `ChatOverlay.vue` (the only consumer) folds this array into a
    // plain object keyed by `~<id>`, so whichever entry it iterates *last*
    // for a given key wins -- i.e. the *last*-declared dccon, not the
    // first. That "last one wins" behaviour lives in ChatOverlay, not here;
    // this test only pins useDccon's own contract: duplicates are kept, not
    // merged, in declaration order.
    it("keeps both entries for a keyword duplicated across two dccon entries, in declaration order", async () => {
      const fixture: DcconData = {
        dccons: [
          {
            keywords: ["hi", "hello"],
            tags: ["greeting"],
            path: "https://cdn.example/a.png",
          },
          {
            keywords: ["hi"],
            tags: ["duplicate"],
            path: "https://cdn.example/b.png",
          },
        ],
      };
      registerEndpoint("https://example.invalid/dccons-b.json", () => fixture);

      const { stickerItems } = useDccon(
        ref<string | null>("https://example.invalid/dccons-b.json"),
      );
      await flushFetch();

      expect(stickerItems.value).toEqual([
        { id: "hello", url: "https://cdn.example/a.png" },
        { id: "hi", url: "https://cdn.example/a.png" },
        { id: "hi", url: "https://cdn.example/b.png" },
      ]);
    });

    it("produces an empty list for a dccon document with no dccons", async () => {
      const fixture: DcconData = { dccons: [] };
      registerEndpoint(
        "https://example.invalid/dccons-empty.json",
        () => fixture,
      );

      const { stickerItems } = useDccon(
        ref<string | null>("https://example.invalid/dccons-empty.json"),
      );
      await flushFetch();

      expect(stickerItems.value).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("a DcconError response ({ message }) is logged and leaves the sticker list empty, without throwing", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      registerEndpoint("https://example.invalid/dccons-error.json", () => ({
        message: "not found",
      }));

      const { stickerItems } = useDccon(
        ref<string | null>("https://example.invalid/dccons-error.json"),
      );
      await flushFetch();

      expect(stickerItems.value).toEqual([]);
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("not found"),
      );
      consoleError.mockRestore();
    });

    // FIXED: `useDccon` now validates the fetched document has a `dccons`
    // array before assigning it to `dcconData`. A payload that is neither a
    // valid `DcconData` nor a `DcconError` -- e.g. `{}`, or a
    // well-formed-looking object missing `dccons` -- is rejected at the
    // fetch boundary: it's logged via `console.error` and never reaches
    // `dcconData.value`, so `stickerItems` stays a safe empty array instead
    // of throwing. Since `dcconUrl` is attacker-controlled (it comes
    // straight from the overlay's query string, and for
    // `useOpenDcconSelector` from a third-party HTTP response), this
    // matters: a malformed or malicious document at that URL must not take
    // down the `stickerItems` computed and, by extension, `ChatOverlay.vue`,
    // which reads it unconditionally on every chat item.
    it("a payload without a `dccons` array is rejected and stickerItems stays empty", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      registerEndpoint(
        "https://example.invalid/dccons-malformed.json",
        () => ({}),
      );

      const { stickerItems } = useDccon(
        ref<string | null>("https://example.invalid/dccons-malformed.json"),
      );
      await flushFetch();

      expect(() => stickerItems.value).not.toThrow();
      expect(stickerItems.value).toEqual([]);
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });

    // A thrown/rejected `$fetch` (network error, non-2xx, or the 1000ms
    // timeout) must not escape `initSticker` as an unhandled rejection --
    // the only caller is a `watch` callback that just `await`s it, so
    // nothing upstream catches it. It should be logged and swallowed, and
    // stickerItems should stay empty.
    it("a rejecting/throwing $fetch is caught, logged, and stickerItems stays empty", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      registerEndpoint("https://example.invalid/dccons-throws.json", () => {
        throw new Error("simulated network failure");
      });

      const { stickerItems } = useDccon(
        ref<string | null>("https://example.invalid/dccons-throws.json"),
      );
      await flushFetch();

      expect(stickerItems.value).toEqual([]);
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });

    // Decision: a later malformed/failed fetch must NOT wipe a previously
    // good document. `initSticker` only assigns `dcconData.value` after the
    // new payload passes validation, so on rejection it simply returns,
    // leaving whatever was fetched last time in place. This matches how a
    // broadcaster would experience it in OBS: a transient bad response from
    // their dccon host (or a temporary edit that produces invalid JSON)
    // should not blank out the stickers that were already working.
    it("keeps the previously-good document when a later fetch returns a malformed payload", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const goodFixture: DcconData = {
        dccons: [
          {
            keywords: ["good"],
            tags: [],
            path: "https://cdn.example/good.png",
          },
        ],
      };
      registerEndpoint(
        "https://example.invalid/dccons-good.json",
        () => goodFixture,
      );
      registerEndpoint("https://example.invalid/dccons-bad.json", () => ({}));

      const dcconUrl = ref<string | null>(
        "https://example.invalid/dccons-good.json",
      );
      const { stickerItems } = useDccon(dcconUrl);
      await flushFetch();

      expect(stickerItems.value).toEqual([
        { id: "good", url: "https://cdn.example/good.png" },
      ]);

      dcconUrl.value = "https://example.invalid/dccons-bad.json";
      await flushFetch();

      expect(stickerItems.value).toEqual([
        { id: "good", url: "https://cdn.example/good.png" },
      ]);
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe("null/empty dcconUrl", () => {
    it("does not fetch when dcconUrl is null", async () => {
      const handler = vi.fn(() => ({ dccons: [] }));
      registerEndpoint(
        "https://example.invalid/should-not-fetch-null.json",
        handler,
      );

      const { stickerItems } = useDccon(ref<string | null>(null));
      await flushFetch();

      expect(handler).not.toHaveBeenCalled();
      expect(stickerItems.value).toEqual([]);
    });

    it("does not fetch when dcconUrl is an empty string", async () => {
      const handler = vi.fn(() => ({ dccons: [] }));
      registerEndpoint(
        "https://example.invalid/should-not-fetch-empty.json",
        handler,
      );

      const { stickerItems } = useDccon(ref<string | null>(""));
      await flushFetch();

      expect(handler).not.toHaveBeenCalled();
      expect(stickerItems.value).toEqual([]);
    });
  });

  describe("re-fetching when the URL ref changes", () => {
    it("fetches the new URL and replaces stickerItems when dcconUrl.value changes", async () => {
      const fixtureA: DcconData = {
        dccons: [
          { keywords: ["one"], tags: [], path: "https://cdn.example/one.png" },
        ],
      };
      const fixtureB: DcconData = {
        dccons: [
          { keywords: ["two"], tags: [], path: "https://cdn.example/two.png" },
        ],
      };
      registerEndpoint(
        "https://example.invalid/dccons-first.json",
        () => fixtureA,
      );
      registerEndpoint(
        "https://example.invalid/dccons-second.json",
        () => fixtureB,
      );

      const dcconUrl = ref<string | null>(
        "https://example.invalid/dccons-first.json",
      );
      const { stickerItems } = useDccon(dcconUrl);
      await flushFetch();

      expect(stickerItems.value).toEqual([
        { id: "one", url: "https://cdn.example/one.png" },
      ]);

      dcconUrl.value = "https://example.invalid/dccons-second.json";
      await flushFetch();

      expect(stickerItems.value).toEqual([
        { id: "two", url: "https://cdn.example/two.png" },
      ]);
    });
  });
});
