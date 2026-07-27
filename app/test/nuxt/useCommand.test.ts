import type { LocationQuery } from "vue-router";

// `useCommand` recognises broadcaster chat messages of the form `!!clear`
// and `!!set <key> <value>`. `!!set` mutates the URL query via
// `router.replace`, which is how it flows back into `useChatOptionsStore`.
//
// Rather than mocking `useRouter` outright (Nuxt's own page/router plugins
// call `useRouter()` during app bootstrap and break if it doesn't return a
// real Router instance), each test uses the real router: it seeds
// `currentRoute` with an initial query via a real `router.replace(...)`
// call, then spies on `router.replace` (stubbing out the navigation itself)
// to observe what `useCommand` calls it with.

async function routerWithQuery(query: LocationQuery) {
  const router = useRouter();
  await router.replace({ query });
  const replaceSpy = vi
    .spyOn(router, "replace")
    .mockImplementation(async () => undefined);
  return replaceSpy;
}

describe("useCommand", () => {
  // The Nuxt test environment reuses a single app (and therefore a single
  // Router instance) across every test in this file. Restore the spy after
  // each test so the next test's seed call goes through the *real*
  // `replace` again instead of a previous test's mocked (navigation-less)
  // one -- otherwise `currentRoute` would never actually update between
  // tests.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("messages that are not commands", () => {
    it("passes a plain message through untouched (returns false, no side effects)", async () => {
      const replaceSpy = await routerWithQuery({});
      const onClear = vi.fn();
      const { onBroadcasterMessage } = useCommand({ onClear });

      const consumed = onBroadcasterMessage("hello everyone!");

      expect(consumed).toBe(false);
      expect(onClear).not.toHaveBeenCalled();
      expect(replaceSpy).not.toHaveBeenCalled();
    });

    it("does not treat a message merely containing '!!' mid-string as a command", async () => {
      await routerWithQuery({});
      const { onBroadcasterMessage } = useCommand({});

      expect(onBroadcasterMessage("wow!! amazing")).toBe(false);
    });
  });

  describe("!!clear", () => {
    it("recognises '!!clear', consumes it, and invokes onClear", async () => {
      const replaceSpy = await routerWithQuery({});
      const onClear = vi.fn();
      const { onBroadcasterMessage } = useCommand({ onClear });

      const consumed = onBroadcasterMessage("!!clear");

      expect(consumed).toBe(true);
      expect(onClear).toHaveBeenCalledTimes(1);
      expect(replaceSpy).not.toHaveBeenCalled();
    });

    it("recognises the Korean alias '!!클리어'", async () => {
      await routerWithQuery({});
      const onClear = vi.fn();
      const { onBroadcasterMessage } = useCommand({ onClear });

      expect(onBroadcasterMessage("!!클리어")).toBe(true);
      expect(onClear).toHaveBeenCalledTimes(1);
    });

    it("does not throw when onClear is not supplied", async () => {
      await routerWithQuery({});
      const { onBroadcasterMessage } = useCommand({});

      expect(() => onBroadcasterMessage("!!clear")).not.toThrow();
    });
  });

  describe("!!set <key> <value>", () => {
    it("adds a brand-new query key that wasn't present before", async () => {
      const replaceSpy = await routerWithQuery({ existing: "kept" });
      const { onBroadcasterMessage } = useCommand({});

      const consumed = onBroadcasterMessage("!!set theme cute-left");

      expect(consumed).toBe(true);
      expect(replaceSpy).toHaveBeenCalledExactlyOnceWith({
        query: { existing: "kept", theme: "cute-left" },
      });
    });

    it("overwrites a query key that was already present", async () => {
      const replaceSpy = await routerWithQuery({
        theme: "default",
        existing: "kept",
      });
      const { onBroadcasterMessage } = useCommand({});

      onBroadcasterMessage("!!set theme cute-right");

      expect(replaceSpy).toHaveBeenCalledExactlyOnceWith({
        query: { theme: "cute-right", existing: "kept" },
      });
    });

    it("recognises the Korean alias '!!설정'", async () => {
      const replaceSpy = await routerWithQuery({});
      const { onBroadcasterMessage } = useCommand({});

      const consumed = onBroadcasterMessage("!!설정 theme pure");

      expect(consumed).toBe(true);
      expect(replaceSpy).toHaveBeenCalledExactlyOnceWith({
        query: { theme: "pure" },
      });
    });

    it("does not validate the key: an unknown key is written to the query as-is", async () => {
      const replaceSpy = await routerWithQuery({});
      const { onBroadcasterMessage } = useCommand({});

      onBroadcasterMessage("!!set notARealOption whatever");

      expect(replaceSpy).toHaveBeenCalledExactlyOnceWith({
        query: { notARealOption: "whatever" },
      });
    });

    it("is consumed (returns true) but is a no-op when the value is missing", async () => {
      const replaceSpy = await routerWithQuery({});
      const { onBroadcasterMessage } = useCommand({});

      const consumed = onBroadcasterMessage("!!set theme");

      expect(consumed).toBe(true);
      expect(replaceSpy).not.toHaveBeenCalled();
    });

    it("is consumed but a no-op when both key and value are missing", async () => {
      const replaceSpy = await routerWithQuery({});
      const { onBroadcasterMessage } = useCommand({});

      expect(onBroadcasterMessage("!!set")).toBe(true);
      expect(replaceSpy).not.toHaveBeenCalled();
    });

    it("is consumed but a no-op when there are too many arguments", async () => {
      const replaceSpy = await routerWithQuery({});
      const { onBroadcasterMessage } = useCommand({});

      expect(onBroadcasterMessage("!!set theme cute-left extra")).toBe(true);
      expect(replaceSpy).not.toHaveBeenCalled();
    });

    // The message is split on a single literal space (`split(" ")`), so
    // consecutive spaces produce empty-string arguments rather than being
    // collapsed. `"!!set  theme cute-left"` (two spaces after `set`) slices
    // to `["set", "", "theme", "cute-left"]` -- 3 args, not 2 -- so the
    // command is silently swallowed (`executeCommand` returns true) without
    // ever calling `router.replace`. This documents that behaviour rather
    // than asserting it "should" tolerate the extra whitespace.
    it("extra whitespace between arguments breaks parsing and silently no-ops", async () => {
      const replaceSpy = await routerWithQuery({});
      const { onBroadcasterMessage } = useCommand({});

      const consumed = onBroadcasterMessage("!!set  theme cute-left");

      expect(consumed).toBe(true);
      expect(replaceSpy).not.toHaveBeenCalled();
    });
  });

  describe("unknown commands", () => {
    it("an unrecognised command is NOT reported as consumed (returns false)", async () => {
      const replaceSpy = await routerWithQuery({});
      const { onBroadcasterMessage } = useCommand({});

      expect(onBroadcasterMessage("!!doesNotExist")).toBe(false);
      expect(replaceSpy).not.toHaveBeenCalled();
    });
  });
});
