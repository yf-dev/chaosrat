import {
  mountSuspended,
  registerEndpoint,
  mockNuxtImport,
} from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import type { LocationQuery, RouteLocationNormalizedLoaded } from "vue-router";
import IndexPage from "~/pages/index.vue";
import { encodeUrlSafeBase64 } from "~/lib/utils";
import type {
  ChzzkAuthBroadcastDeps,
  ChzzkAuthState,
} from "~/lib/chzzkAuthBroadcast";

// `pages/index.vue` is the overlay URL builder: its real logic is reading
// form state and producing the `/chat?...` query string (base64-encoding the
// two regex fields, omitting keys that are empty/off/default). That's the
// exact counterpart of `useChatOptionsStore`'s parsing (see
// `useChatOptionsStore.test.ts`), so the highest-value test here is a
// round-trip: fill the real rendered form, read the resulting URL back out
// of the DOM, feed its query through the real store, and assert the parsed
// `chatOptions` match what was entered. That catches builder/parser drift --
// exactly the bug class that would otherwise ship silently, since nothing
// else in the codebase cross-checks these two directions against each other.
//
// Two things are deliberately NOT exercised here, per scope:
// - The live preview `<iframe>` (`ClientOnly` + `src="chatOverlayUrl"`): it
//   just points at the same URL under test elsewhere; asserting on iframe
//   internals would mean loading the whole app a second time inside itself.
// - `useClipboard`'s real browser clipboard access: it's a plain `import`
//   (not a Nuxt auto-import), so `mockNuxtImport` can't reach it; it's
//   replaced with `vi.mock("@vueuse/core", ...)` below, keeping every other
//   export real and substituting a controllable `{ copy, copied }` pair so
//   the *button's own* copy/"복사됨" toggle logic can still be verified
//   without touching the Clipboard API.
//
// `$fetch("/api/chzzk/me")` (called unconditionally in `onMounted`) is
// stubbed with `registerEndpoint` to return a non-OK `ApiError`, so the page
// settles with `chzzkChannelId` empty. A non-OK `/api/chzzk/me` now also
// triggers one recovery `/api/chzzk/auth/refresh` + retry (see
// `resolveChzzkAuthState` in pages/index.vue), so `/api/chzzk/auth/refresh`
// is stubbed here too -- otherwise that recovery attempt would hit a real,
// unmocked route in every test that mounts through this helper. The chzzk
// login/logout flow itself, and chzzkChannelId's own contribution to the URL
// (which the template only ever sets via that fetch response, never via a
// direct input), are out of scope for a URL-builder test focused on the
// fields the user actually types into.

// `useTimeoutPoll` is mocked the same way `test/nuxt/useChzzk.test.ts` mocks
// it: capture the polled callback via `useTimeoutPollMock` instead of letting
// a real 60s timer run in tests. Unlike that file, this mock also auto-fires
// the callback once when `immediate: true` is passed -- matching what the
// real implementation does synchronously at setup time (see
// `useTimeoutPoll`'s `resume()` in `@vueuse/core`) -- so every existing test
// below that relied on the old `onMounted`-triggered `/api/chzzk/me` check
// keeps working unchanged. Tests that care about a *later* tick call
// `pollCheckChzzkAuth()` to invoke the captured callback again.
const { useTimeoutPollMock } = vi.hoisted(() => ({
  useTimeoutPollMock: vi.fn(),
}));

// Mirrors `test/nuxt/useChzzk.test.ts`'s harness for the same module: capture
// the `deps` passed to `createChzzkAuthBroadcast` (so `onRemoteState` can be
// driven directly, simulating a message from another tab) and the returned
// `{ publish, close }` (so what this page pushes out can be asserted). No
// real `BroadcastChannel` is ever opened.
const { capturedAuthBroadcastDeps, capturedAuthBroadcast } = vi.hoisted(() => ({
  capturedAuthBroadcastDeps: { current: undefined as unknown },
  capturedAuthBroadcast: { current: undefined as unknown },
}));

// `selectAuthChannelFactory`/`createNoopAuthChannel` are kept real via
// `importOriginal` -- they're pure and side-effect-free (see
// `lib/chzzkAuthBroadcast.ts`), and `pages/index.vue` calls
// `selectAuthChannelFactory` at module-setup time to build the `createChannel`
// it hands to `createChzzkAuthBroadcast`, so a wholesale mock without it would
// throw before the page ever mounts. Only `createChzzkAuthBroadcast` itself is
// replaced, same as before.
vi.mock("~/lib/chzzkAuthBroadcast", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/lib/chzzkAuthBroadcast")>();
  return {
    ...actual,
    createChzzkAuthBroadcast: vi.fn((deps: ChzzkAuthBroadcastDeps) => {
      capturedAuthBroadcastDeps.current = deps;
      const broadcast = {
        publish: vi.fn(),
        close: vi.fn(async () => {}),
      };
      capturedAuthBroadcast.current = broadcast;
      return broadcast;
    }),
  };
});

function authBroadcastDeps(): ChzzkAuthBroadcastDeps {
  return capturedAuthBroadcastDeps.current as ChzzkAuthBroadcastDeps;
}

function authBroadcast(): {
  publish: ReturnType<typeof vi.fn<(state: ChzzkAuthState) => void>>;
  close: ReturnType<typeof vi.fn<() => Promise<void>>>;
} {
  return capturedAuthBroadcast.current as {
    publish: ReturnType<typeof vi.fn<(state: ChzzkAuthState) => void>>;
    close: ReturnType<typeof vi.fn<() => Promise<void>>>;
  };
}

// Invokes the callback `useTimeoutPoll` was given, simulating a later poll
// tick (the initial one already ran via the mock's auto-fire-on-immediate
// behaviour, see above).
function pollCheckChzzkAuth(): Promise<void> {
  const calls = useTimeoutPollMock.mock.calls;
  return calls[calls.length - 1][0]();
}

// A single `flushPromises()` (one macrotask tick) is enough to observe the
// result of a *single* awaited `$fetch` against @nuxt/test-utils'
// `registerEndpoint` mock -- every pre-existing test above relies on exactly
// that. The recovery/verification sequence (`/api/chzzk/me` ->
// `/api/chzzk/auth/refresh` -> retry `/api/chzzk/me`) chains multiple such
// calls sequentially before resolving, and how many ticks that needs to fully
// settle is not a fixed small number -- it empirically varies with what else
// is mid-flight (e.g. a mount's own trailing keep-alive refresh still
// settling). Loop generously rather than pin an exact count: each extra tick
// past the point everything has already settled is a near-free no-op
// `setTimeout(0)`, whereas under-flushing leaves a hop still in flight when
// assertions run, which doesn't just fail *this* test -- the dangling
// promise resolves during whatever runs next and corrupts a later test's
// call counts instead. Use this wherever a test drives that chain to
// completion, instead of a bare `flushPromises()`.
async function flushChzzkRecoveryChain(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await flushPromises();
  }
}

// `~/lib/chzzkAuthBroadcast` is mocked wholesale above, so the real
// `createChzzkAuthBroadcast` -- and therefore its `deps.createChannel`
// factory -- never runs. That factory (`(name) => new BroadcastChannel(name)`
// in pages/index.vue) is exercised directly by calling
// `authBroadcastDeps().createChannel(...)` in a dedicated test; `BroadcastChannel`
// itself is mocked here too so that call never opens a real channel. Mirrors
// `test/unit/useSharedConnectionElectorMock.test.ts`'s mock of the same
// library: a real `function`, not an arrow, so `new BroadcastChannel(...)`
// stays a valid construct call.
const { broadcastChannelMock } = vi.hoisted(() => ({
  broadcastChannelMock: vi.fn(function BroadcastChannel() {
    return {
      close: vi.fn(async () => {}),
      postMessage: vi.fn(),
      onmessage: null,
    };
  }),
}));

vi.mock("broadcast-channel", () => ({
  BroadcastChannel: broadcastChannelMock,
}));

vi.mock("@vueuse/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vueuse/core")>();
  return {
    ...actual,
    useClipboard: vi.fn(() => ({
      copy: vi.fn(async () => undefined),
      copied: ref(false),
    })),
    useTimeoutPoll: vi.fn(
      (
        fn: () => void | Promise<void>,
        interval: number,
        options?: { immediate?: boolean },
      ) => {
        useTimeoutPollMock(fn, interval, options);
        if (options?.immediate) {
          void fn();
        }
        return { pause: vi.fn(), resume: vi.fn(), isActive: ref(false) };
      },
    ),
  };
});

function fakeRoute(query: LocationQuery): RouteLocationNormalizedLoaded {
  return { query } as unknown as RouteLocationNormalizedLoaded;
}

mockNuxtImport("useRoute", () => {
  return vi.fn(() => fakeRoute({}));
});

// Parses the generated overlay URL's query string back through the *real*
// `useChatOptionsStore`, exactly as the overlay itself would when it
// receives this URL -- this is the "parser" half of the round trip.
function parseBackThroughStore(chatOverlayUrl: string) {
  const url = new URL(chatOverlayUrl);
  const query: LocationQuery = Object.fromEntries(url.searchParams.entries());
  setActivePinia(createPinia());
  vi.mocked(useRoute).mockReturnValue(fakeRoute(query));
  return useChatOptionsStore().chatOptions;
}

async function mountIndexPage() {
  registerEndpoint("/api/chzzk/me", () => ({
    status: "ERROR",
    code: "NOT_LOGGED_IN",
    error: "not logged in",
  }));
  registerEndpoint("/api/chzzk/auth/refresh", () => ({
    status: "ERROR",
    code: "internal_server_error",
    error: "boom",
  }));
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const wrapper = await mountSuspended(IndexPage);
  await flushChzzkRecoveryChain();
  consoleError.mockRestore();
  return wrapper;
}

function urlInputValue(wrapper: Awaited<ReturnType<typeof mountIndexPage>>) {
  return (wrapper.find("#chatOverlayUrl").element as HTMLInputElement).value;
}

async function mountWithChzzkMe(
  meResponse: unknown,
  refreshResponse: unknown = { status: "OK" },
) {
  registerEndpoint("/api/chzzk/me", () => meResponse);
  registerEndpoint("/api/chzzk/auth/refresh", () => refreshResponse);
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const wrapper = await mountSuspended(IndexPage);
  // Fully settles mount's own me -> keep-alive-refresh chain before handing
  // control back, so a test that immediately re-registers endpoints and
  // drives a second chain right after (e.g. simulating a remote broadcast)
  // never races a still-in-flight request from this initial mount -- see
  // flushChzzkRecoveryChain's comment.
  await flushChzzkRecoveryChain();
  consoleError.mockRestore();
  return wrapper;
}

describe("pages/index.vue", () => {
  describe("URL builder / store parser round trip", () => {
    it("omits every key at the all-defaults baseline", async () => {
      const wrapper = await mountIndexPage();

      const chatOptions = parseBackThroughStore(urlInputValue(wrapper));

      expect(chatOptions).toMatchObject({
        chzzkChannelId: undefined,
        twitchChannel: undefined,
        youtubeHandle: undefined,
        kickChannel: undefined,
        theme: undefined, // "default" is never written, store falls back to undefined
        maxChatSize: 100,
        hiddenUsernameRegex: undefined,
        hiddenMessageRegex: undefined,
        soundEffectType: undefined, // "none" is never written
        soundEffectVolume: 100,
        soundEffectCustomUrl: undefined,
        isUseOpenDcconSelector: false,
        isHidePlatformIcon: false,
        isDisableAnimation: false,
      });
    });

    it("round-trips a full set of non-default options back to themselves", async () => {
      const wrapper = await mountIndexPage();

      await wrapper.find("#twitchChannel").setValue("sleeping_ce");
      await wrapper.find("#youtubeHandle").setValue("@sleeping.c.elegans");
      await wrapper.find("#kickChannel").setValue("sleeping-c-elegans");
      await wrapper.find("#theme").setValue("cute-left");
      await wrapper.find("#maxChatSize").setValue("55");
      await wrapper.find("#hiddenUsernameRegex").setValue("^bot_.*$");
      await wrapper.find("#hiddenMessageRegex").setValue("(spam|scam)");
      await wrapper.find("#soundEffectType").setValue("custom");
      await wrapper
        .find("#soundEffectCustomUrl")
        .setValue("https://example.com/sound-effect.mp3");
      await wrapper.find("#soundEffectVolume").setValue("42");
      // The checkbox is `:disabled="!twitchChannel"` -- only settable now
      // that twitchChannel has already been filled in above.
      await wrapper.find("#isUseOpenDcconSelector").setValue(true);
      await wrapper.find("#isHidePlatformIcon").setValue(true);
      await wrapper.find("#isDisableAnimation").setValue(true);

      const chatOptions = parseBackThroughStore(urlInputValue(wrapper));

      expect(chatOptions).toEqual({
        chzzkChannelId: undefined,
        twitchChannel: "sleeping_ce",
        youtubeHandle: "@sleeping.c.elegans",
        kickChannel: "sleeping-c-elegans",
        theme: "cute-left",
        maxChatSize: 55,
        hiddenUsernameRegex: "^bot_.*$",
        hiddenMessageRegex: "(spam|scam)",
        soundEffectType: "custom",
        soundEffectVolume: 42,
        soundEffectCustomUrl: "https://example.com/sound-effect.mp3",
        isUseOpenDcconSelector: true,
        isHidePlatformIcon: true,
        isDisableAnimation: true,
      });
    });

    it("regex fields are base64url-encoded in the URL itself, not left as plaintext", async () => {
      const wrapper = await mountIndexPage();

      await wrapper.find("#hiddenUsernameRegex").setValue("^bot_.*$");

      const rawUrl = urlInputValue(wrapper);
      expect(rawUrl).not.toContain("bot_");
      expect(rawUrl).toContain(
        `hiddenUsernameRegex=${encodeUrlSafeBase64("^bot_.*$")}`,
      );
    });

    it("does not set isUseOpenDcconSelector in the URL when twitchChannel is empty (checkbox is disabled)", async () => {
      const wrapper = await mountIndexPage();

      const checkbox = wrapper.find("#isUseOpenDcconSelector");
      expect((checkbox.element as HTMLInputElement).disabled).toBe(true);

      const chatOptions = parseBackThroughStore(urlInputValue(wrapper));
      expect(chatOptions.isUseOpenDcconSelector).toBe(false);
    });

    it("sets isDisableAnimation in the URL when the checkbox is checked, and omits it otherwise", async () => {
      const wrapper = await mountIndexPage();

      const uncheckedChatOptions = parseBackThroughStore(
        urlInputValue(wrapper),
      );
      expect(uncheckedChatOptions.isDisableAnimation).toBe(false);

      await wrapper.find("#isDisableAnimation").setValue(true);

      const checkedChatOptions = parseBackThroughStore(urlInputValue(wrapper));
      expect(checkedChatOptions.isDisableAnimation).toBe(true);
    });

    it("dropping soundEffectType back to 'none' omits soundEffectVolume/soundEffectCustomUrl even if they were previously set", async () => {
      const wrapper = await mountIndexPage();

      await wrapper.find("#soundEffectType").setValue("custom");
      await wrapper
        .find("#soundEffectCustomUrl")
        .setValue("https://example.com/sound-effect.mp3");
      await wrapper.find("#soundEffectVolume").setValue("30");
      await wrapper.find("#soundEffectType").setValue("none");

      const rawUrl = urlInputValue(wrapper);
      expect(rawUrl).not.toContain("soundEffectVolume");
      expect(rawUrl).not.toContain("soundEffectCustomUrl");
      expect(rawUrl).not.toContain("soundEffectType");
    });

    it("a non-custom soundEffectType (e.g. 'beep') is written to the URL without soundEffectCustomUrl", async () => {
      const wrapper = await mountIndexPage();

      await wrapper.find("#soundEffectType").setValue("beep");

      const rawUrl = urlInputValue(wrapper);
      expect(rawUrl).toContain("soundEffectType=beep");
      expect(rawUrl).not.toContain("soundEffectCustomUrl");
    });
  });

  describe("copy-to-clipboard button", () => {
    it("shows 'URL 복사' initially and '복사됨' once the mocked copy() has been used (copied flips to true)", async () => {
      const wrapper = await mountIndexPage();

      const button = wrapper.find(".input-with-button button.primary");
      expect(button.text()).toBe("URL 복사");

      // `useClipboard`'s `copied` ref is mocked (see the file-level
      // `vi.mock`); flipping it here simulates what the real composable
      // would do after a successful `copy()` call, without touching the
      // Clipboard API. This isolates the template's *own* logic --
      // `{{ copiedChatOverlayUrl ? "복사됨" : "URL 복사" }}` -- from
      // useClipboard's internals.
      // `useClipboard` is a single module-level mock shared by every test in
      // this file (module mocks are cached), so its `mock.results` array
      // accumulates one entry per `mountIndexPage()` call across the whole
      // file -- `.at(-1)` is this test's own mount, not a leftover from an
      // earlier one.
      const { useClipboard } = await import("@vueuse/core");
      const mockedReturn = vi.mocked(useClipboard).mock.results.at(-1)?.value;
      mockedReturn.copied.value = true;
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".input-with-button button.primary").text()).toBe(
        "복사됨",
      );
    });

    it("clicking the copy button calls useClipboard's copy() with the current chatOverlayUrl", async () => {
      const wrapper = await mountIndexPage();
      await wrapper.find("#twitchChannel").setValue("sleeping_ce");

      const { useClipboard } = await import("@vueuse/core");
      const mockedReturn = vi.mocked(useClipboard).mock.results.at(-1)?.value;

      await wrapper.find(".input-with-button button.primary").trigger("click");

      expect(mockedReturn.copy).toHaveBeenCalledWith(urlInputValue(wrapper));
    });
  });

  // These tests deliberately go where `mountIndexPage()`'s own header comment
  // says is out of scope for the URL-builder-focused tests above: the chzzk
  // login/logout flow (`loginToChzzk`/`logoutFromChzzk`) and the `onMounted`
  // handler that calls `/api/chzzk/me`. That flow has real branching (success/
  // non-OK/throw for each of three async functions) that was previously
  // entirely untested.
  describe("chzzk login/logout flow", () => {
    it("onMounted: logs in, includes chzzkChannelId in the URL, and refreshes the token on a successful /api/chzzk/me", async () => {
      const wrapper = await mountWithChzzkMe({
        status: "OK",
        channelId: "chan-1",
        channelName: "My Channel",
      });

      expect(wrapper.text()).toContain("현재 로그인한 치지직 채널: My Channel");
      expect(urlInputValue(wrapper)).toContain("chzzkChannelId=chan-1");
    });

    it("onMounted: stays logged out and does not throw when /api/chzzk/me itself fails to fetch", async () => {
      registerEndpoint("/api/chzzk/me", () => {
        throw new Error("network down");
      });
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const wrapper = await mountSuspended(IndexPage);
      await flushPromises();
      consoleError.mockRestore();

      expect(wrapper.text()).toContain("치지직 로그인");
      expect(urlInputValue(wrapper)).not.toContain("chzzkChannelId");
    });

    it("loginToChzzk: navigates to the returned authUrl on success", async () => {
      const wrapper = await mountIndexPage();
      registerEndpoint("/api/chzzk/auth/login", () => ({
        status: "OK",
        authUrl: "https://chzzk.naver.com/account-interlock?state=abc",
      }));

      const originalLocation = window.location;
      // @ts-expect-error -- intentional test-only override
      delete window.location;
      window.location = { href: "" } as unknown as Location;

      await wrapper.find(".link").trigger("click");
      await flushPromises();

      expect(window.location.href).toBe(
        "https://chzzk.naver.com/account-interlock?state=abc",
      );

      window.location = originalLocation;
    });

    it("loginToChzzk: does not navigate when the login fetch resolves with a non-OK status", async () => {
      const wrapper = await mountIndexPage();
      registerEndpoint("/api/chzzk/auth/login", () => ({
        status: "ERROR",
        code: "internal_server_error",
        error: "boom",
      }));
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const originalLocation = window.location;
      // @ts-expect-error -- intentional test-only override
      delete window.location;
      window.location = { href: "" } as unknown as Location;

      await wrapper.find(".link").trigger("click");
      await flushPromises();

      expect(window.location.href).toBe("");

      window.location = originalLocation;
      consoleError.mockRestore();
    });

    it("loginToChzzk: does not navigate or throw when the login fetch itself fails", async () => {
      const wrapper = await mountIndexPage();
      registerEndpoint("/api/chzzk/auth/login", () => {
        throw new Error("network down");
      });
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const originalLocation = window.location;
      // @ts-expect-error -- intentional test-only override
      delete window.location;
      window.location = { href: "" } as unknown as Location;

      await expect(
        wrapper.find(".link").trigger("click"),
      ).resolves.toBeUndefined();
      await flushPromises();

      expect(window.location.href).toBe("");

      window.location = originalLocation;
      consoleError.mockRestore();
    });

    it("logoutFromChzzk: clears login state and drops chzzkChannelId from the URL on success", async () => {
      const wrapper = await mountWithChzzkMe({
        status: "OK",
        channelId: "chan-1",
        channelName: "My Channel",
      });
      expect(urlInputValue(wrapper)).toContain("chzzkChannelId=chan-1");
      registerEndpoint("/api/chzzk/auth/logout", () => ({ status: "OK" }));

      // The logout link is the second `.link` (the first is the login link,
      // only rendered while logged out; while logged in, only this one is).
      await wrapper.find(".link").trigger("click");
      await flushPromises();

      expect(wrapper.text()).toContain("치지직 로그인");
      expect(urlInputValue(wrapper)).not.toContain("chzzkChannelId");
    });

    it("logoutFromChzzk: stays logged in and logs when the logout fetch resolves with a non-OK status", async () => {
      const wrapper = await mountWithChzzkMe({
        status: "OK",
        channelId: "chan-1",
        channelName: "My Channel",
      });
      registerEndpoint("/api/chzzk/auth/logout", () => ({
        status: "ERROR",
        code: "internal_server_error",
        error: "boom",
      }));
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await wrapper.find(".link").trigger("click");
      await flushPromises();

      expect(wrapper.text()).toContain("현재 로그인한 치지직 채널: My Channel");
      consoleError.mockRestore();
    });

    it("logoutFromChzzk: stays logged in and does not throw when the logout fetch itself fails", async () => {
      const wrapper = await mountWithChzzkMe({
        status: "OK",
        channelId: "chan-1",
        channelName: "My Channel",
      });
      registerEndpoint("/api/chzzk/auth/logout", () => {
        throw new Error("network down");
      });
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await expect(
        wrapper.find(".link").trigger("click"),
      ).resolves.toBeUndefined();
      await flushPromises();

      expect(wrapper.text()).toContain("현재 로그인한 치지직 채널: My Channel");
      consoleError.mockRestore();
    });
  });

  // Closes the bug this page had: it checked CHZZK login state exactly once,
  // in `onMounted`, and never again -- so a login/logout completed in another
  // tab (or even in this same tab after 60s) never showed up without a
  // manual reload. These tests cover the three mechanisms that fix that: this
  // page's own 60s poll, an inbound push from another tab, and an outbound
  // push on this tab's own logout. See `lib/chzzkAuthBroadcast.ts` for the
  // push channel itself (unit-tested independently in
  // `test/unit/chzzkAuthBroadcast.test.ts`) and the harness above for how it
  // and `useTimeoutPoll` are mocked here.
  describe("chzzk auth: cross-tab broadcast and re-polling", () => {
    it("a remote AUTHENTICATED state switches the page to the logged-in UI without an extra /api/chzzk/me call", async () => {
      const meHandler = vi.fn(() => ({
        status: "ERROR",
        code: "NOT_LOGGED_IN",
        error: "not logged in",
      }));
      registerEndpoint("/api/chzzk/me", meHandler);
      // The initial /api/chzzk/me failure now also drives one recovery
      // refresh + retry (see resolveChzzkAuthState) -- register it too, so
      // the mount settles into LOGIN_REQUIRED cleanly instead of leaving a
      // dangling fetch against an unmocked route.
      registerEndpoint("/api/chzzk/auth/refresh", () => ({
        status: "ERROR",
        code: "internal_server_error",
        error: "boom",
      }));
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const wrapper = await mountSuspended(IndexPage);
      await flushChzzkRecoveryChain();
      consoleError.mockRestore();

      expect(wrapper.text()).toContain("치지직 로그인");
      // 2, not 1: the first call fails, triggering the recovery retry above.
      expect(meHandler).toHaveBeenCalledTimes(2);

      authBroadcastDeps().onRemoteState({
        status: "AUTHENTICATED",
        channelId: "remote-chan",
        channelName: "Remote Channel",
      });
      await wrapper.vm.$nextTick();

      expect(wrapper.text()).toContain(
        "현재 로그인한 치지직 채널: Remote Channel",
      );
      expect(urlInputValue(wrapper)).toContain("chzzkChannelId=remote-chan");
      // Still 2, not 3: no fetch is triggered by applying a remote state --
      // it's a pure push.
      expect(meHandler).toHaveBeenCalledTimes(2);
    });

    it("a remote LOGIN_REQUIRED state, once this tab's own verification also confirms it, switches the page back to the logged-out UI", async () => {
      const wrapper = await mountWithChzzkMe({
        status: "OK",
        channelId: "chan-1",
        channelName: "My Channel",
      });
      expect(urlInputValue(wrapper)).toContain("chzzkChannelId=chan-1");

      // A remote LOGIN_REQUIRED is no longer trusted blindly (see the
      // dedicated describe block below) -- it triggers this tab's own
      // verification, which must also come back non-OK for the page to
      // actually log out.
      registerEndpoint("/api/chzzk/me", () => ({
        status: "ERROR",
        code: "NOT_LOGGED_IN",
        error: "not logged in",
      }));
      registerEndpoint("/api/chzzk/auth/refresh", () => ({
        status: "ERROR",
        code: "internal_server_error",
        error: "boom",
      }));
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      authBroadcastDeps().onRemoteState({ status: "LOGIN_REQUIRED" });
      // Verification is a real async /api/chzzk/me (+ refresh + retry) round
      // trip, not just a synchronous state update -- see
      // flushChzzkRecoveryChain's comment for why a bare flushPromises()
      // isn't enough here.
      await flushChzzkRecoveryChain();
      consoleError.mockRestore();

      expect(wrapper.text()).toContain("치지직 로그인");
      expect(urlInputValue(wrapper)).not.toContain("chzzkChannelId");
    });

    it("the poll re-checks /api/chzzk/me on a later tick and publishes what it resolved", async () => {
      let meResponse: unknown = {
        status: "ERROR",
        code: "NOT_LOGGED_IN",
        error: "not logged in",
      };
      registerEndpoint("/api/chzzk/me", () => meResponse);
      registerEndpoint("/api/chzzk/auth/refresh", () => ({ status: "OK" }));
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const wrapper = await mountSuspended(IndexPage);
      // The initial ERROR response drives a full recovery chain (me ->
      // refresh -> retry me, itself still ERROR at this point) -- let it
      // fully settle before reassigning meResponse below, or the recovery
      // retry could race past the reassignment and read the *second* tick's
      // value instead of its own.
      await flushChzzkRecoveryChain();

      expect(wrapper.text()).toContain("치지직 로그인");

      meResponse = {
        status: "OK",
        channelId: "chan-poll",
        channelName: "Polled Channel",
      };
      await pollCheckChzzkAuth();
      await flushPromises();
      consoleError.mockRestore();

      expect(wrapper.text()).toContain(
        "현재 로그인한 치지직 채널: Polled Channel",
      );
      expect(authBroadcast().publish).toHaveBeenCalledWith({
        status: "AUTHENTICATED",
        channelId: "chan-poll",
        channelName: "Polled Channel",
      });
    });

    it("a later check does not overwrite chzzkChannelId once it has been populated, but the first check still populates it", async () => {
      let meResponse: unknown = {
        status: "OK",
        channelId: "chan-first",
        channelName: "First Channel",
      };
      registerEndpoint("/api/chzzk/me", () => meResponse);
      registerEndpoint("/api/chzzk/auth/refresh", () => ({ status: "OK" }));
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const wrapper = await mountSuspended(IndexPage);
      await flushPromises();

      expect(urlInputValue(wrapper)).toContain("chzzkChannelId=chan-first");

      meResponse = {
        status: "OK",
        channelId: "chan-second",
        channelName: "Second Channel",
      };
      await pollCheckChzzkAuth();
      await flushPromises();
      consoleError.mockRestore();

      // The displayed identity follows the latest check...
      expect(wrapper.text()).toContain(
        "현재 로그인한 치지직 채널: Second Channel",
      );
      // ...but the URL's chzzkChannelId, once populated, is never clobbered
      // by a later check.
      expect(urlInputValue(wrapper)).toContain("chzzkChannelId=chan-first");
      expect(urlInputValue(wrapper)).not.toContain("chan-second");
    });

    it("a thrown /api/chzzk/me on a later poll tick leaves the logged-in state untouched and publishes nothing", async () => {
      const wrapper = await mountWithChzzkMe({
        status: "OK",
        channelId: "chan-1",
        channelName: "My Channel",
      });
      authBroadcast().publish.mockClear();

      registerEndpoint("/api/chzzk/me", () => {
        throw new Error("network down");
      });
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      await pollCheckChzzkAuth();
      await flushPromises();
      consoleError.mockRestore();

      expect(wrapper.text()).toContain("현재 로그인한 치지직 채널: My Channel");
      expect(urlInputValue(wrapper)).toContain("chzzkChannelId=chan-1");
      expect(authBroadcast().publish).not.toHaveBeenCalled();
    });

    it("the refresh keep-alive fires once total, not on every poll tick", async () => {
      const refreshHandler = vi.fn(() => ({ status: "OK" }));
      let meResponse: unknown = {
        status: "OK",
        channelId: "chan-1",
        channelName: "My Channel",
      };
      registerEndpoint("/api/chzzk/me", () => meResponse);
      registerEndpoint("/api/chzzk/auth/refresh", refreshHandler);
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const wrapper = await mountSuspended(IndexPage);
      await flushPromises();

      expect(refreshHandler).toHaveBeenCalledTimes(1);

      meResponse = {
        status: "OK",
        channelId: "chan-1",
        channelName: "My Channel Renamed",
      };
      await pollCheckChzzkAuth();
      await flushPromises();
      consoleError.mockRestore();

      expect(wrapper.text()).toContain(
        "현재 로그인한 치지직 채널: My Channel Renamed",
      );
      expect(refreshHandler).toHaveBeenCalledTimes(1);
    });

    it("logoutFromChzzk publishes LOGIN_REQUIRED so other tabs drop their session immediately", async () => {
      const wrapper = await mountWithChzzkMe({
        status: "OK",
        channelId: "chan-1",
        channelName: "My Channel",
      });
      registerEndpoint("/api/chzzk/auth/logout", () => ({ status: "OK" }));

      await wrapper.find(".link").trigger("click");
      await flushPromises();

      expect(authBroadcast().publish).toHaveBeenCalledWith({
        status: "LOGIN_REQUIRED",
      });
    });

    it("closes the auth broadcast channel on unmount", async () => {
      const wrapper = await mountIndexPage();

      wrapper.unmount();

      expect(authBroadcast().close).toHaveBeenCalledTimes(1);
    });

    it("a rejected /api/chzzk/auth/refresh keep-alive does not undo a successful identity check, and does not wedge the poll", async () => {
      const meHandler = vi.fn(() => ({
        status: "OK",
        channelId: "chan-1",
        channelName: "My Channel",
      }));
      registerEndpoint("/api/chzzk/me", meHandler);
      registerEndpoint("/api/chzzk/auth/refresh", () => {
        throw new Error("network down");
      });
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const wrapper = await mountSuspended(IndexPage);
      await flushPromises();

      // The refresh keep-alive rejected, but that must not undo the
      // already-successful identity check.
      expect(wrapper.text()).toContain("현재 로그인한 치지직 채널: My Channel");
      expect(meHandler).toHaveBeenCalledTimes(1);

      // The rejection must not wedge the poll -- a later tick still runs to
      // completion (i.e. the returned promise settles rather than hanging or
      // rejecting) and re-checks /api/chzzk/me.
      await expect(pollCheckChzzkAuth()).resolves.toBeUndefined();
      await flushPromises();
      consoleError.mockRestore();

      expect(meHandler).toHaveBeenCalledTimes(2);
      expect(wrapper.text()).toContain("현재 로그인한 치지직 채널: My Channel");
    });

    it("the createChannel factory passed to createChzzkAuthBroadcast constructs a real BroadcastChannel with the given name", async () => {
      const wrapper = await mountIndexPage();
      broadcastChannelMock.mockClear();

      const channel = authBroadcastDeps().createChannel("some-channel-name");

      expect(broadcastChannelMock).toHaveBeenCalledWith("some-channel-name");
      expect(channel).toBeDefined();
      void wrapper;
    });
  });

  // Closes the bug where this page trusted a single "not logged in" /api/
  // chzzk/me envelope as proof of logout. The access-token cookie's maxAge is
  // the token's 1-day expiresIn (server/api/chzzk/auth/callback.ts,
  // server/api/chzzk/auth/refresh.ts) while the refresh-token cookie lasts 30
  // days, so a day after last use /api/chzzk/me legitimately returns
  // not_logged_in even though a refresh would still succeed. These tests pin
  // the recovery sequence this page now shares with useChzzk.ts's
  // resolveAuthState: try /api/chzzk/me, and only on a non-OK envelope (not a
  // thrown fetch, which is covered above) POST /api/chzzk/auth/refresh once
  // and retry /api/chzzk/me before concluding LOGIN_REQUIRED.
  describe("chzzk auth: recovery via refresh when /api/chzzk/me first fails", () => {
    it("not_logged_in followed by a successful refresh and a successful retry ends AUTHENTICATED, publishing AUTHENTICATED", async () => {
      let meCallCount = 0;
      const meHandler = vi.fn(() => {
        meCallCount += 1;
        if (meCallCount === 1) {
          return {
            status: "ERROR",
            code: "NOT_LOGGED_IN",
            error: "not logged in",
          };
        }
        return {
          status: "OK",
          channelId: "chan-recovered",
          channelName: "Recovered Channel",
        };
      });
      registerEndpoint("/api/chzzk/me", meHandler);
      const refreshHandler = vi.fn(() => ({ status: "OK" }));
      registerEndpoint("/api/chzzk/auth/refresh", refreshHandler);
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const wrapper = await mountSuspended(IndexPage);
      await flushChzzkRecoveryChain();
      consoleError.mockRestore();

      expect(meHandler).toHaveBeenCalledTimes(2);
      expect(refreshHandler).toHaveBeenCalledTimes(1);
      expect(wrapper.text()).toContain(
        "현재 로그인한 치지직 채널: Recovered Channel",
      );
      expect(urlInputValue(wrapper)).toContain("chzzkChannelId=chan-recovered");
      expect(authBroadcast().publish).toHaveBeenCalledWith({
        status: "AUTHENTICATED",
        channelId: "chan-recovered",
        channelName: "Recovered Channel",
      });
    });

    it("not_logged_in whose refresh+retry also fails ends LOGIN_REQUIRED, publishing LOGIN_REQUIRED", async () => {
      const meHandler = vi.fn(() => ({
        status: "ERROR",
        code: "NOT_LOGGED_IN",
        error: "not logged in",
      }));
      registerEndpoint("/api/chzzk/me", meHandler);
      const refreshHandler = vi.fn(() => ({ status: "OK" }));
      registerEndpoint("/api/chzzk/auth/refresh", refreshHandler);
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const wrapper = await mountSuspended(IndexPage);
      await flushChzzkRecoveryChain();
      consoleError.mockRestore();

      expect(meHandler).toHaveBeenCalledTimes(2);
      expect(refreshHandler).toHaveBeenCalledTimes(1);
      expect(wrapper.text()).toContain("치지직 로그인");
      expect(authBroadcast().publish).toHaveBeenCalledWith({
        status: "LOGIN_REQUIRED",
      });
    });

    it("a refresh call that itself throws also ends LOGIN_REQUIRED rather than wedging, after actually attempting the refresh", async () => {
      const meHandler = vi.fn(() => ({
        status: "ERROR",
        code: "NOT_LOGGED_IN",
        error: "not logged in",
      }));
      registerEndpoint("/api/chzzk/me", meHandler);
      const refreshHandler = vi.fn(() => {
        throw new Error("network down");
      });
      registerEndpoint("/api/chzzk/auth/refresh", refreshHandler);
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await expect(mountSuspended(IndexPage)).resolves.toBeDefined();
      await flushChzzkRecoveryChain();
      consoleError.mockRestore();

      // The recovery path must actually attempt the refresh, not just fall
      // straight through to LOGIN_REQUIRED on the first non-OK /api/chzzk/me.
      expect(refreshHandler).toHaveBeenCalledTimes(1);
      // Refresh itself threw, so the retry /api/chzzk/me is never attempted.
      expect(meHandler).toHaveBeenCalledTimes(1);
      expect(authBroadcast().publish).toHaveBeenCalledWith({
        status: "LOGIN_REQUIRED",
      });
    });
  });

  // Closes the second half of the same bug: this page broadcast every
  // resolved state -- including a wrongly-concluded LOGIN_REQUIRED -- to every
  // other open tab. In this app the other tabs are OBS Browser Sources, so a
  // false LOGIN_REQUIRED from one tab could flash "치지직 로그인이 필요합니다"
  // on a live overlay. A remote LOGIN_REQUIRED must now be verified with this
  // tab's own check (including the refresh-retry above) before being trusted,
  // and that verification must never itself publish -- otherwise one real
  // logout would cause every tab to publish, causing every other tab to
  // verify again, and so on.
  describe("chzzk auth: a remote LOGIN_REQUIRED is verified locally before being trusted", () => {
    it("is not trusted blindly: if this tab's own check still succeeds, it stays logged in and publishes nothing", async () => {
      const wrapper = await mountWithChzzkMe({
        status: "OK",
        channelId: "chan-1",
        channelName: "My Channel",
      });
      authBroadcast().publish.mockClear();

      const meHandler = vi.fn(() => ({
        status: "OK",
        channelId: "chan-1",
        channelName: "My Channel",
      }));
      registerEndpoint("/api/chzzk/me", meHandler);
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      authBroadcastDeps().onRemoteState({ status: "LOGIN_REQUIRED" });
      await flushChzzkRecoveryChain();
      consoleError.mockRestore();

      expect(meHandler).toHaveBeenCalledTimes(1);
      expect(wrapper.text()).toContain("현재 로그인한 치지직 채널: My Channel");
      expect(authBroadcast().publish).not.toHaveBeenCalled();
    });

    it("a thrown /api/chzzk/me during verification leaves the existing state untouched and publishes nothing", async () => {
      const wrapper = await mountWithChzzkMe({
        status: "OK",
        channelId: "chan-1",
        channelName: "My Channel",
      });
      authBroadcast().publish.mockClear();

      // A network/timeout failure on verification's own /api/chzzk/me is not
      // a definitive answer -- same rule as checkChzzkAuth's own first call
      // (see the "thrown ... leaves the logged-in state untouched" test
      // above), just reached via the remote-push path this time.
      registerEndpoint("/api/chzzk/me", () => {
        throw new Error("network down");
      });
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      authBroadcastDeps().onRemoteState({ status: "LOGIN_REQUIRED" });
      await flushChzzkRecoveryChain();
      consoleError.mockRestore();

      expect(wrapper.text()).toContain("현재 로그인한 치지직 채널: My Channel");
      expect(authBroadcast().publish).not.toHaveBeenCalled();
    });

    it("is confirmed when this tab's own check (refresh + retry included) also fails: ends logged out, still publishing nothing", async () => {
      const wrapper = await mountWithChzzkMe({
        status: "OK",
        channelId: "chan-1",
        channelName: "My Channel",
      });
      authBroadcast().publish.mockClear();

      const meHandler = vi.fn(() => ({
        status: "ERROR",
        code: "NOT_LOGGED_IN",
        error: "not logged in",
      }));
      registerEndpoint("/api/chzzk/me", meHandler);
      const refreshHandler = vi.fn(() => ({
        status: "ERROR",
        code: "internal_server_error",
        error: "boom",
      }));
      registerEndpoint("/api/chzzk/auth/refresh", refreshHandler);
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      authBroadcastDeps().onRemoteState({ status: "LOGIN_REQUIRED" });
      await flushChzzkRecoveryChain();
      consoleError.mockRestore();

      // The remote push must actually have been verified locally -- not just
      // trusted -- via this tab's own me-then-refresh-then-retry sequence.
      expect(meHandler).toHaveBeenCalledTimes(2);
      expect(refreshHandler).toHaveBeenCalledTimes(1);
      expect(wrapper.text()).toContain("치지직 로그인");
      // The verification path resolved LOGIN_REQUIRED locally too, but must
      // still not publish -- only this tab's own poll is allowed to.
      expect(authBroadcast().publish).not.toHaveBeenCalled();
    });

    it("a remote AUTHENTICATED is still applied immediately, with no verification network call", async () => {
      const meHandler = vi.fn(() => ({
        status: "ERROR",
        code: "NOT_LOGGED_IN",
        error: "not logged in",
      }));
      registerEndpoint("/api/chzzk/me", meHandler);
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const wrapper = await mountSuspended(IndexPage);
      await flushPromises();
      consoleError.mockRestore();
      expect(meHandler).toHaveBeenCalledTimes(1);

      authBroadcastDeps().onRemoteState({
        status: "AUTHENTICATED",
        channelId: "remote-chan",
        channelName: "Remote Channel",
      });
      await wrapper.vm.$nextTick();

      expect(wrapper.text()).toContain(
        "현재 로그인한 치지직 채널: Remote Channel",
      );
      // Still no extra network call -- a good-news push is trusted as-is.
      expect(meHandler).toHaveBeenCalledTimes(1);
    });
  });
});
