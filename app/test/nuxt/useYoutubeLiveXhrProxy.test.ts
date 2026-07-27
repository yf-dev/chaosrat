// `useYoutubeLive.ts` has a module-level side effect (`replaceXhrOpen()`,
// called unconditionally at the bottom of the file) that monkey-patches
// `window.XMLHttpRequest.prototype.open` so `youtube-chat`'s XHR calls to
// youtube.com get rewritten to go through `/api/youtubeLive/proxy/...`
// instead (a CORS workaround -- youtube.com doesn't allow direct
// cross-origin requests from the browser).
//
// This lives in its own file, separate from useYoutubeLive.test.ts, because
// testing it requires installing a spy as `window.XMLHttpRequest.prototype.open`
// *before* the module is first evaluated (so `replaceXhrOpen()` captures our
// spy as its `original_function`), then forcing a fresh module evaluation via
// `vi.resetModules()` + a dynamic import. Doing that in the same file as
// useYoutubeLive.test.ts would invalidate that file's `vi.mock("youtube-chat")`
// cache and any already-imported `useYoutubeLive` binding for every test
// declared after it.

describe("useYoutubeLive.ts XHR proxy patch (updateUrl / replaceXhrOpen)", () => {
  it("rewrites youtube.com XHR requests to the local proxy route, and converts (but does not redirect) other origins", async () => {
    const originalOpenSpy = vi.fn();
    const previousOpen = window.XMLHttpRequest.prototype.open;
    // Stand in as the "native" open that replaceXhrOpen() will wrap, so it
    // captures `originalOpenSpy` as its closed-over `original_function`.
    window.XMLHttpRequest.prototype.open = originalOpenSpy;

    try {
      vi.resetModules();
      await import("~/composables/chatPlatforms/useYoutubeLive");

      const patchedOpen = window.XMLHttpRequest.prototype.open;
      expect(patchedOpen).not.toBe(originalOpenSpy);

      const xhr = new XMLHttpRequest();

      // The patched `open`'s declared type is the DOM's overloaded
      // XMLHttpRequest#open signature, and `.call()` on an overloaded
      // function type resolves against its last (5-param) overload only --
      // so `async` must be passed explicitly here even though the patched
      // function's own runtime default (`async = true`) would otherwise
      // cover this. This mirrors, rather than changes, what `open()` does at
      // runtime when a caller (like `youtube-chat`) omits `async`.
      patchedOpen.call(xhr, "GET", "https://www.youtube.com/foo/bar?x=1", true);
      // `url.pathname` already starts with "/", so `updateUrl()` must not
      // insert another "/" after "proxy" (that would double it up). Verified
      // server-side (server/api/youtubeLive/proxy/[...path].ts) that a
      // leading vs. non-leading slash in the route path resolves to the same
      // upstream URL, so this single-slash form is the intended output.
      expect(originalOpenSpy).toHaveBeenLastCalledWith(
        "GET",
        "/api/youtubeLive/proxy/foo/bar?x=1",
        true,
        undefined,
        undefined,
      );

      patchedOpen.call(xhr, "POST", "https://example.com/other", false);
      // Non-youtube.com origins are not redirected to the proxy, but the
      // string is still parsed into a URL object first -- worth pinning
      // since it changes the argument's type even on the no-op path.
      const lastCallArgs = originalOpenSpy.mock.calls.at(-1);
      expect(lastCallArgs?.[0]).toBe("POST");
      expect(String(lastCallArgs?.[1])).toBe("https://example.com/other");
      expect(lastCallArgs?.[2]).toBe(false);
    } finally {
      window.XMLHttpRequest.prototype.open = previousOpen;
    }
  });
});
