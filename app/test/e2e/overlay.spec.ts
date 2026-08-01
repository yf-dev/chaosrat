import { test, expect } from "@playwright/test";
import { openOverlay } from "./fixtures/overlay";
import {
  BASIC_MESSAGES,
  RICH_MESSAGE,
  STICKER_MESSAGE,
} from "./fixtures/chatFixtures";
import { STICKER_KEYWORD } from "./fixtures/network";
import { encodeUrlSafeBase64 } from "../../lib/utils";
import type { ChatTheme } from "../../lib/interfaces";

// Drives real messages through the mocked Twitch IRC transport into the
// real pipeline: useTwitch -> useChatItems -> ChatOverlay -> theme
// component. Covers rendering, filtering, capping, moderation, the
// HTML-escaping/XSS boundary and the seven-theme switch.

test.describe("overlay: rendering and ordering", () => {
  test("messages render one .item each, with nickname and message text, in timestamp order", async ({
    page,
  }) => {
    await openOverlay(page, {
      query: { theme: "default" },
      messages: BASIC_MESSAGES,
    });

    const items = page.locator(".item");
    await expect(items).toHaveCount(BASIC_MESSAGES.length);

    for (let i = 0; i < BASIC_MESSAGES.length; i++) {
      const item = items.nth(i);
      await expect(item).toContainText(BASIC_MESSAGES[i].displayName);
      await expect(item).toContainText(BASIC_MESSAGES[i].message);
    }
  });
});

test.describe("overlay: maxChatSize caps the list and keeps the newest", () => {
  test("sending more than maxChatSize drops the oldest and keeps the newest", async ({
    page,
  }) => {
    const cap = 3;
    const total = 6;
    const messages = Array.from({ length: total }, (_, i) => ({
      id: `e2e-cap-${String(i).padStart(4, "0")}`,
      displayName: `CapUser${i}`,
      message: `cap message number ${i}`,
    }));

    // openOverlay's `messages` option waits for `.item` count to equal
    // the number of messages sent -- wrong here, since capping means the
    // rendered count (`cap`) is smaller than what was sent (`total`). Open
    // with no messages and send them manually instead.
    const { irc } = await openOverlay(page, {
      query: { theme: "default", maxChatSize: String(cap) },
      irc: { channel: "cap_channel" },
    });
    for (const message of messages) {
      await irc.sendMessage(message);
    }

    const items = page.locator(".item");
    await expect(items).toHaveCount(cap);

    // Oldest (total - cap) messages must be gone entirely.
    for (let i = 0; i < total - cap; i++) {
      await expect(page.getByText(messages[i].displayName)).toHaveCount(0);
    }
    // Newest `cap` messages must be present, in order.
    for (let i = total - cap; i < total; i++) {
      const item = items.nth(i - (total - cap));
      await expect(item).toContainText(messages[i].displayName);
    }
  });
});

test.describe("overlay: regex filters", () => {
  test("hiddenUsernameRegex hides matching nicknames, hiddenMessageRegex hides matching text", async ({
    page,
  }) => {
    const messages = [
      { id: "e2e-f-0001", displayName: "KeepMe", message: "this stays" },
      {
        id: "e2e-f-0002",
        displayName: "HideByName",
        message: "this also stays",
      },
      {
        id: "e2e-f-0003",
        displayName: "AlsoKeep",
        message: "contains BADWORD here",
      },
    ];
    // openOverlay's `messages` option sends every message as soon as the
    // IRC mock reports `connected` and waits for the matching `.item`
    // count -- but a filter means fewer `.item`s than messages sent, so
    // that built-in wait can't be used directly here. Send them manually
    // and assert on the filtered result instead.
    const { irc } = await openOverlay(page, {
      query: {
        theme: "default",
        hiddenUsernameRegex: encodeUrlSafeBase64("^HideByName$"),
        hiddenMessageRegex: encodeUrlSafeBase64("BADWORD"),
      },
      irc: { channel: "filter_channel" },
    });
    for (const message of messages) {
      await irc.sendMessage(message);
    }

    await expect(page.locator(".item")).toHaveCount(1);
    await expect(page.getByText("KeepMe")).toBeVisible();
    await expect(page.getByText("HideByName")).toHaveCount(0);
    await expect(page.getByText("AlsoKeep")).toHaveCount(0);
  });
});

test.describe("overlay: invalid regex degrades to no filter instead of crashing", () => {
  test("an unparseable hiddenUsernameRegex still renders all messages instead of killing the overlay", async ({
    page,
  }) => {
    // "(" is not a valid RegExp source, and it reaches ChatOverlay.vue's
    // `new RegExp(...)`, which has no try/catch anywhere in the file. The
    // store validates at the URL boundary instead
    // (stores/useChatOptionsStore.ts's decodeValidRegexSource) and treats an
    // invalid pattern as "no filter" -- the fix in 9b8ee0e.
    //
    // The `pageerror` assertion below is the part that actually discriminates,
    // and it is here because the obvious assertion does NOT. Removing
    // decodeValidRegexSource's validation and re-running this test was tried
    // directly: all three messages still render. `useChatItems`'s chatItems
    // computed applies the filter via `.filter(...)`, which never invokes the
    // predicate while the list is empty, so nothing evaluates the bad pattern
    // during setup and the component mounts fine; the throw only happens once
    // the first message arrives, and Vue keeps the rendered output. So a
    // rendered-item count alone passes with the guard deleted -- it is not a
    // regression test at all. An uncaught "Invalid regular expression" on the
    // page is the observable that does flip.
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await openOverlay(page, {
      query: {
        theme: "default",
        hiddenUsernameRegex: encodeUrlSafeBase64("("),
        hiddenMessageRegex: encodeUrlSafeBase64("*invalid("),
      },
      messages: BASIC_MESSAGES,
    });

    await expect(page.locator(".item")).toHaveCount(BASIC_MESSAGES.length);
    for (const message of BASIC_MESSAGES) {
      await expect(page.getByText(message.displayName)).toBeVisible();
    }
    expect(pageErrors).toEqual([]);
  });
});

test.describe("overlay: isHidePlatformIcon", () => {
  test("absent isHidePlatformIcon shows the platform icon", async ({
    page,
  }) => {
    await openOverlay(page, {
      query: { theme: "default" },
      messages: [BASIC_MESSAGES[0]],
      irc: { channel: "icon_shown_channel" },
    });
    await expect(page.locator("img.icon")).toHaveCount(1);
  });

  test("isHidePlatformIcon=true hides it", async ({ page }) => {
    await openOverlay(page, {
      query: { theme: "default", isHidePlatformIcon: "true" },
      messages: [BASIC_MESSAGES[0]],
      irc: { channel: "icon_hidden_channel" },
    });
    await expect(page.locator(".item")).toHaveCount(1);
    await expect(page.locator("img.icon")).toHaveCount(0);
  });
});

test.describe("overlay: badges and emotes", () => {
  test("badges and emotes render as real img.badge / img.emoji elements with the mocked URLs", async ({
    page,
  }) => {
    await openOverlay(page, {
      query: { theme: "default" },
      messages: [RICH_MESSAGE],
      irc: { channel: "rich_channel" },
    });

    await expect(page.locator(".item")).toHaveCount(1);

    const badges = page.locator("img.badge");
    // broadcaster/1 + subscriber/12
    await expect(badges).toHaveCount(2);
    const badgeSrcs = await badges.evaluateAll((imgs) =>
      imgs.map((img) => (img as HTMLImageElement).src),
    );
    expect(
      badgeSrcs.some((src) => src.startsWith("data:image/png;base64,")),
    ).toBe(true);

    // Unlike badges (whose src is a data: URI returned directly by the
    // mocked /api/twitch/badges response), the emote <img> src is the real
    // static-cdn.jtvnw.net URL computed client-side by tmi-utils's
    // getEmoteAsUrl() -- network.ts's stub intercepts the *fetch* of that
    // URL and serves TWITCH_EMOTE_PNG bytes, it does not rewrite the URL
    // string itself. So assert the real CDN URL shape, and separately
    // confirm the mocked bytes actually loaded as a decodable image
    // (proving the request was served, not left hanging or 404ing).
    const emojis = page.locator("img.emoji");
    await expect(emojis).toHaveCount(1);
    const emojiSrc = await emojis.first().getAttribute("src");
    expect(emojiSrc).toMatch(/^https:\/\/static-cdn\.jtvnw\.net\/emoticons\//);
    const emojiNaturalWidth = await emojis
      .first()
      .evaluate((img) => (img as HTMLImageElement).naturalWidth);
    expect(emojiNaturalWidth).toBeGreaterThan(0);
  });
});

test.describe("overlay: stickers", () => {
  test("a ~keyword message renders img.sticker when isUseOpenDcconSelector=true", async ({
    page,
  }) => {
    await openOverlay(page, {
      query: {
        theme: "default",
        isUseOpenDcconSelector: "true",
        twitchChannel: "sticker_channel",
      },
      messages: [STICKER_MESSAGE],
      irc: { channel: "sticker_channel" },
    });

    await expect(page.locator(".item")).toHaveCount(1);
    await expect(page.locator("img.sticker")).toHaveCount(1);
  });

  test("without isUseOpenDcconSelector, the ~keyword renders as plain text, not a sticker", async ({
    page,
  }) => {
    await openOverlay(page, {
      query: { theme: "default" },
      messages: [STICKER_MESSAGE],
      irc: { channel: "sticker_off_channel" },
    });

    await expect(page.locator(".item")).toHaveCount(1);
    await expect(page.locator("img.sticker")).toHaveCount(0);
    await expect(page.getByText(`~${STICKER_KEYWORD}`)).toBeVisible();
  });
});

test.describe("overlay: HTML-escaping / DOM-XSS boundary", () => {
  test("markup in a chat message is rendered as inert text -- no element created, nothing executes", async ({
    page,
  }) => {
    const marker = "e2e-xss-marker-basic";
    await page.addInitScript(() => {
      (window as unknown as { __scriptRan?: boolean }).__scriptRan = false;
    });

    await openOverlay(page, {
      query: { theme: "default" },
      messages: [
        {
          id: "e2e-xss-0001",
          displayName: "XssUser",
          message: `before <img src=x onerror="window.__scriptRan=true"> <script>window.__scriptRan=true</script> after ${marker}`,
        },
      ],
      irc: { channel: "xss_channel" },
    });

    await expect(page.locator(".item")).toHaveCount(1);
    await expect(page.getByText(marker, { exact: false })).toBeVisible();

    // messageHtml() HTML-escapes chat.message, so the <img>/<script> markup
    // survives only as inert text -- neither element, nor anything they'd
    // execute, should exist.
    await expect(page.locator(".item img[src='x']")).toHaveCount(0);
    await expect(page.locator(".item script")).toHaveCount(0);

    const scriptRan = await page.evaluate(
      () => (window as unknown as { __scriptRan?: boolean }).__scriptRan,
    );
    expect(scriptRan).toBe(false);
  });

  test("a sticker URL containing a double quote cannot break out of the src attribute", async ({
    page,
  }) => {
    // The defect fixed in 9b8ee0e: messageHtml() interpolated
    // emoji/sticker URLs into `src="..."` *after* the sanitizer of the day had
    // already run over chat.message, so the sanitizer never saw the URL
    // content at all. A sticker path containing a `"` broke out of the
    // attribute and injected an arbitrary attribute (e.g. onerror) on the
    // resulting <img>. lib/utils.ts's stickerToTag now runs the URL
    // through escapeHtml() first.
    //
    // network.ts's shared stub always serves a fixed, safe sticker path,
    // so this test installs its own network stub (not modifying the
    // shared fixture file) with a route for the dccon document that
    // returns a deliberately hostile `path`, registered *after* the
    // shared stub so Playwright's last-registered-first matching lets it
    // win for that one URL.
    const { stubExternalNetwork, STICKER_KEYWORD: keyword } =
      await import("./fixtures/network");
    const { installTwitchIrcMock } = await import("./fixtures/twitchIrc");

    await page.addInitScript(() => {
      (window as unknown as { __xssFired?: boolean }).__xssFired = false;
    });

    await stubExternalNetwork(page, { dcconKeyword: keyword });

    const hostileUrl =
      'https://e2e-fixture.invalid/dccon/x.png" onerror="window.__xssFired=true';
    await page.route(
      "https://open-dccon-selector.update.sh/api/dccon-url*",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            user_id: "e2e-fixture",
            dccon_url: "https://e2e-fixture.invalid/dccon/document.json",
          }),
        }),
    );
    await page.route(
      "https://e2e-fixture.invalid/dccon/document.json",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            dccons: [{ keywords: [keyword], tags: ["e2e"], path: hostileUrl }],
          }),
        }),
    );

    const channel = "xss_sticker_channel";
    const irc = await installTwitchIrcMock(page, { channel });
    const search = new URLSearchParams({
      theme: "default",
      twitchChannel: channel,
      isUseOpenDcconSelector: "true",
    }).toString();
    await page.goto(`/chat?${search}`);
    await irc.waitForConnected();
    await irc.sendMessage({
      id: "e2e-xss-sticker-0001",
      displayName: "StickerXss",
      message: `nice ~${keyword} sticker`,
    });

    await expect(page.locator(".item")).toHaveCount(1);
    // The sticker element itself must still render (proving the sticker
    // path was exercised, not silently skipped) ...
    await expect(page.locator("img.sticker")).toHaveCount(1);
    // ... but as a single well-formed element with no injected onerror
    // attribute breaking out of src.
    const stickerHandleCount = await page.locator("img.sticker").count();
    expect(stickerHandleCount).toBe(1);

    const xssFired = await page.evaluate(
      () => (window as unknown as { __xssFired?: boolean }).__xssFired,
    );
    expect(xssFired).toBe(false);
  });
});

test.describe("overlay: CLEARCHAT, CLEARMSG and ban", () => {
  test("CLEARCHAT empties the list", async ({ page }) => {
    const { irc } = await openOverlay(page, {
      query: { theme: "default" },
      messages: BASIC_MESSAGES,
      irc: { channel: "clear_channel" },
    });
    await expect(page.locator(".item")).toHaveCount(BASIC_MESSAGES.length);

    await irc.sendClearChat();
    await expect(page.locator(".item")).toHaveCount(0);
  });

  test("CLEARMSG removes just the targeted message", async ({ page }) => {
    const messages = [
      { id: "e2e-del-0001", displayName: "KeepA", message: "keep a" },
      {
        id: "e2e-del-0002",
        displayName: "DeleteMe",
        message: "delete this one",
      },
      { id: "e2e-del-0003", displayName: "KeepB", message: "keep b" },
    ];
    const { irc } = await openOverlay(page, {
      query: { theme: "default" },
      messages,
      irc: { channel: "delmsg_channel" },
    });
    await expect(page.locator(".item")).toHaveCount(3);

    await irc.sendMessageDeleted("e2e-del-0002");
    await expect(page.locator(".item")).toHaveCount(2);
    await expect(page.getByText("DeleteMe")).toHaveCount(0);
    await expect(page.getByText("KeepA")).toBeVisible();
    await expect(page.getByText("KeepB")).toBeVisible();
  });

  test("a ban removes that user's messages", async ({ page }) => {
    const banned = {
      id: "e2e-ban-0001",
      displayName: "BannedUser",
      message: "will be banned",
      userId: "111222333",
    };
    const survivor = {
      id: "e2e-ban-0002",
      displayName: "SafeUser",
      message: "stays put",
      userId: "444555666",
    };
    const { irc } = await openOverlay(page, {
      query: { theme: "default" },
      messages: [banned, survivor],
      irc: { channel: "ban_channel" },
    });
    await expect(page.locator(".item")).toHaveCount(2);

    await irc.sendBan(banned.userId!);
    await expect(page.locator(".item")).toHaveCount(1);
    await expect(page.getByText("BannedUser")).toHaveCount(0);
    await expect(page.getByText("SafeUser")).toBeVisible();
  });
});

test.describe("overlay: all seven themes mount and render", () => {
  // Keyed by the ChatTheme union so an added theme becomes a vue-tsc
  // compile error here (missing key in the Record literal) rather than a
  // silently-uncovered theme -- see ChatOverlay.vue's chatListComponent
  // switch, which this loop pins the resolution of. Appearance itself is
  // the parallel visual-snapshot spec's job, not this one's.
  const THEME_QUERY_VALUES: Record<ChatTheme, string> = {
    default: "default",
    colorful: "colorful",
    "video-master": "video-master",
    simple: "simple",
    pure: "pure",
    "cute-left": "cute-left",
    "cute-right": "cute-right",
  };

  for (const theme of Object.keys(THEME_QUERY_VALUES) as ChatTheme[]) {
    test(`theme=${theme} mounts and renders a chat message`, async ({
      page,
    }) => {
      const channel = `theme_${theme.replace(/[^a-z0-9]/gi, "_")}`;
      const { network } = await openOverlay(page, {
        query: { theme },
        messages: [BASIC_MESSAGES[0]],
        irc: { channel },
      });

      await expect(page.locator(".item")).toHaveCount(1);
      await expect(page.getByText(BASIC_MESSAGES[0].message)).toBeVisible();

      // Hermeticity: this theme's mount reached no unmocked external host.
      expect(network.abortedRequests).toEqual([]);
    });
  }
});

test.describe("overlay: chat list motion (useChatListMotion / TransitionGroup)", () => {
  // These three tests pin the phase-1/2 motion feature end to end: a real
  // browser, a real Vue <TransitionGroup>, real CSS transitions -- not just
  // that `useChatListMotion.ts` returns the right value (that's covered by
  // its own vitest unit test). `openOverlay`'s fixture-level settle wait
  // (see fixtures/overlay.ts) means the DOM is guaranteed to be free of
  // enter/leave/move classes right after it resolves, so any class we see
  // afterwards was caused by the state change *this* test drives, not
  // leftover motion from initial render.
  //
  // A plain `await`+immediate-read race against a fast (200ms) CSS
  // transition would very likely read the DOM after the class was already
  // removed, so every test here arms a MutationObserver *before* triggering
  // the change and reads its result *after* the visible effect (a new
  // `.item`, a shrunk `.item` count) has settled -- the same "observe the
  // transient class as it happens" approach `fixtures/overlay.ts` documents
  // for its own settle wait, applied here to prove the transient state was
  // reached instead of waiting it out.

  test("a message arriving after the page has settled transiently carries chat-enter-active, proving the list renders through TransitionGroup", async ({
    page,
  }) => {
    const { irc } = await openOverlay(page, {
      query: { theme: "default" },
      messages: [BASIC_MESSAGES[0]],
      irc: { channel: "motion_enter_channel" },
    });
    await expect(page.locator(".item")).toHaveCount(1);

    await page.evaluate(() => {
      (
        window as unknown as { __enterActiveSeen: Promise<boolean> }
      ).__enterActiveSeen = new Promise((resolve) => {
        const list = document.querySelector(".list");
        if (!list) {
          resolve(false);
          return;
        }
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            const target = mutation.target as HTMLElement;
            if (
              target.classList?.contains("item") &&
              target.classList.contains("chat-enter-active")
            ) {
              observer.disconnect();
              resolve(true);
              return;
            }
          }
        });
        observer.observe(list, {
          attributes: true,
          attributeFilter: ["class"],
          childList: true,
          subtree: true,
        });
        // Safety net so a reintroduced regression (e.g. listTag forced back
        // to "div") fails this assertion instead of hanging the test until
        // Playwright's own default timeout.
        setTimeout(() => {
          observer.disconnect();
          resolve(false);
        }, 3000);
      });
    });

    await irc.sendMessage({
      id: "e2e-motion-enter-0001",
      displayName: "MotionEnterUser",
      message: "arrives after the list has settled",
    });
    await expect(page.locator(".item")).toHaveCount(2);

    const sawEnterActive = await page.evaluate(
      () =>
        (window as unknown as { __enterActiveSeen: Promise<boolean> })
          .__enterActiveSeen,
    );
    expect(sawEnterActive).toBe(true);
  });

  test("isDisableAnimation=true still renders arriving messages correctly, and chat-enter-active/chat-move/chat-leave-active never appear", async ({
    page,
  }) => {
    const { irc } = await openOverlay(page, {
      query: { theme: "default", isDisableAnimation: "true" },
      messages: [BASIC_MESSAGES[0]],
      irc: { channel: "motion_disabled_channel" },
    });
    await expect(page.locator(".item")).toHaveCount(1);

    await page.evaluate(() => {
      (window as unknown as { __motionClassSeen: boolean }).__motionClassSeen =
        false;
      const list = document.querySelector(".list");
      if (!list) return;
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          const target = mutation.target as HTMLElement;
          if (
            target.classList?.contains("chat-enter-active") ||
            target.classList?.contains("chat-move") ||
            target.classList?.contains("chat-leave-active")
          ) {
            (
              window as unknown as { __motionClassSeen: boolean }
            ).__motionClassSeen = true;
          }
        }
      });
      observer.observe(list, {
        attributes: true,
        attributeFilter: ["class"],
        childList: true,
        subtree: true,
      });
      (
        window as unknown as { __motionObserver?: MutationObserver }
      ).__motionObserver = observer;
    });

    await irc.sendMessage({
      id: "e2e-motion-disabled-0001",
      displayName: "MotionDisabledUser",
      message: "arrives with animation off",
    });
    await expect(page.locator(".item")).toHaveCount(2);
    await expect(page.getByText("arrives with animation off")).toBeVisible();
    // Give any (incorrectly present) transition a full window to start --
    // `--motion-duration` is 200ms; 500ms leaves ample margin without
    // padding the suite by much.
    await page.waitForTimeout(500);

    const sawMotionClass = await page.evaluate(
      () =>
        (window as unknown as { __motionClassSeen: boolean }).__motionClassSeen,
    );
    expect(sawMotionClass).toBe(false);
  });

  test("a CLEARMSG removal transiently carries chat-leave-active before the item disappears", async ({
    page,
  }) => {
    const messages = [
      {
        id: "e2e-motion-del-0001",
        displayName: "MotionKeep",
        message: "keep this one",
      },
      {
        id: "e2e-motion-del-0002",
        displayName: "MotionRemove",
        message: "remove this one",
      },
    ];
    const { irc } = await openOverlay(page, {
      query: { theme: "default" },
      messages,
      irc: { channel: "motion_leave_channel" },
    });
    await expect(page.locator(".item")).toHaveCount(2);

    await page.evaluate(() => {
      (
        window as unknown as { __leaveActiveSeen: Promise<boolean> }
      ).__leaveActiveSeen = new Promise((resolve) => {
        const list = document.querySelector(".list");
        if (!list) {
          resolve(false);
          return;
        }
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            const target = mutation.target as HTMLElement;
            if (
              target.classList?.contains("item") &&
              target.classList.contains("chat-leave-active")
            ) {
              observer.disconnect();
              resolve(true);
              return;
            }
          }
        });
        observer.observe(list, {
          attributes: true,
          attributeFilter: ["class"],
          childList: true,
          subtree: true,
        });
        setTimeout(() => {
          observer.disconnect();
          resolve(false);
        }, 3000);
      });
    });

    await irc.sendMessageDeleted("e2e-motion-del-0002");
    // `.item` stays in flow for the duration of its leave transition (see
    // useChatListMotion.ts's file comment), so this count only drops to 1
    // once the transition has actually finished.
    await expect(page.locator(".item")).toHaveCount(1);
    await expect(page.getByText("MotionRemove")).toHaveCount(0);
    await expect(page.getByText("MotionKeep")).toBeVisible();

    const sawLeaveActive = await page.evaluate(
      () =>
        (window as unknown as { __leaveActiveSeen: Promise<boolean> })
          .__leaveActiveSeen,
    );
    expect(sawLeaveActive).toBe(true);
  });
});

test.describe("overlay: chat list motion under real (non-reduced) motion", () => {
  // Every OTHER test in this file (including the "chat list motion" block
  // above) runs under this suite's ambient `contextOptions.reducedMotion:
  // "reduce"` (playwright.config.ts), which forces every theme's
  // `prefers-reduced-motion: reduce` branch: transition-duration collapses
  // to 1ms and `translate` offsets collapse straight to `none`. That keeps
  // `toHaveScreenshot`/`captureStyleFingerprint` deterministic, but it also
  // means the *default* full-motion path -- the one every real OBS viewer
  // gets, since `isDisableAnimation` defaults to off -- is otherwise never
  // exercised anywhere in the suite. This block opts back into real motion
  // for exactly the tests that need to observe it.
  //
  // The key thing to get right: a plain `test.use({ reducedMotion:
  // "no-preference" })` does NOT override the config's setting, precisely
  // because the config sets it through `contextOptions` rather than as a
  // direct `PlaywrightTestOptions` field -- it has to be overridden the
  // same way, and each test below independently asserts
  // `matchMedia("(prefers-reduced-motion: reduce)").matches === false`
  // rather than trusting that this override took effect.
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  // All seven themes now ship a `.chat-move` rule. `colorful` and
  // `cute-left`/`cute-right` are the interesting cases: their `.item`
  // carries a CSS `rotate:`, and TransitionGroup's FLIP move writes a plain
  // vertical `transform: translate(0, dy)` on its direct child -- composed
  // with that rotation, applying the inline transform directly to `.item`
  // would swing it sideways by `dy * tan(theta)` (this was a real,
  // measured defect, not a hypothetical -- see those themes' DESIGN.md
  // Motion sections). The fix is a `.motion-slot` wrapper that sits between
  // `.list` and `.item` and is the actual `TransitionGroup` direct child, so
  // FLIP's inline transform lands on an un-rotated box and the drift this
  // test checks for should be exactly zero on every theme, tilted or not.
  const ALL_THEMES: ChatTheme[] = [
    "default",
    "simple",
    "pure",
    "video-master",
    "colorful",
    "cute-left",
    "cute-right",
  ];

  test("the enter transition really animates opacity and translate under the default (non-reduced) motion setting", async ({
    page,
  }) => {
    const { irc } = await openOverlay(page, {
      query: { theme: "default" },
      messages: [BASIC_MESSAGES[0]],
      irc: { channel: "motion_realmotion_enter_channel" },
    });

    const reducedMotionActive = await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    expect(reducedMotionActive).toBe(false);

    await page.evaluate(() => {
      type Sample = { opacity: number; translateY: number };
      const w = window as unknown as {
        __enterSamples: Sample[];
        __enterInterval: ReturnType<typeof setInterval>;
      };
      w.__enterSamples = [];
      const list = document.querySelector(".list");
      const parseTranslateY = (value: string): number => {
        if (!value || value === "none") return 0;
        const parts = value.trim().split(/\s+/);
        if (parts.length < 2) return 0;
        return parseFloat(parts[1]);
      };
      w.__enterInterval = setInterval(() => {
        const el = list?.querySelector(".chat-enter-active");
        if (!el) return;
        const cs = getComputedStyle(el);
        w.__enterSamples.push({
          opacity: parseFloat(cs.opacity),
          translateY: parseTranslateY(cs.translate),
        });
      }, 16);
    });

    await irc.sendMessage({
      id: "e2e-motion-real-enter-0001",
      displayName: "RealMotionEnterUser",
      message: "arrives under real motion",
    });
    await expect(page.locator(".item")).toHaveCount(2);
    // --motion-duration is 200ms; a generously longer window keeps this
    // from reading zero samples on a slow CI machine.
    await page.waitForTimeout(600);

    const samples = await page.evaluate(() => {
      const w = window as unknown as {
        __enterSamples: { opacity: number; translateY: number }[];
        __enterInterval: ReturnType<typeof setInterval>;
      };
      clearInterval(w.__enterInterval);
      return w.__enterSamples;
    });

    // Shape, not exact numbers (timing-dependent -> flaky): it must have
    // been captured at all, must pass through a genuine intermediate
    // opacity, and must pass through a genuine intermediate translate
    // offset strictly between the 1.2rem/12px start and the 0/none end.
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.some((s) => s.opacity > 0 && s.opacity < 1)).toBe(true);
    expect(samples.some((s) => s.translateY > 0 && s.translateY < 12)).toBe(
      true,
    );
  });

  test("the leave transition really animates opacity when a maxChatSize trim removes the oldest message", async ({
    page,
  }) => {
    // Reproduces the real trigger, not a synthetic one: a `maxChatSize` trim
    // is the common case that actually drops a message, and it is also the
    // one case where the leaving element ALSO receives `.chat-move` --
    // TransitionGroup applies that class to a leaving element whenever its
    // position also changed in the same update, which happens here because
    // the bottom-anchored list shifts everything up when the message that
    // triggers the trim is inserted. `.chat-move` and `.chat-leave-active`
    // have equal specificity, so whichever CSS rule is written later in the
    // stylesheet wins outright (the `transition` shorthand replaces, it does
    // not merge) -- this is exactly the bug a synthetic single-item leave
    // (e.g. a CLEARMSG deletion with nothing else on screen) would miss,
    // since nothing shifts and `.chat-move` is never applied there.
    const cap = 3;
    const { irc } = await openOverlay(page, {
      query: { theme: "default", maxChatSize: String(cap) },
      irc: { channel: "motion_realmotion_leave_channel" },
    });

    const reducedMotionActive = await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    expect(reducedMotionActive).toBe(false);

    const fillMessages = Array.from({ length: cap }, (_, i) => ({
      id: `e2e-motion-leave-fill-${i}`,
      displayName: `LeaveFillUser${i}`,
      message: `fill message ${i}`,
    }));
    for (const message of fillMessages) {
      await irc.sendMessage(message);
    }
    await expect(page.locator(".item")).toHaveCount(cap);
    // Let the fill messages' own enter/move transitions finish so only the
    // upcoming trim's leave transition is being sampled below.
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          ".chat-enter-active, .chat-leave-active, .chat-move",
        ).length === 0,
    );

    await page.evaluate(() => {
      type Sample = { opacity: number; nickname: string };
      const w = window as unknown as {
        __leaveSamples: Sample[];
        __leaveInterval: ReturnType<typeof setInterval>;
      };
      w.__leaveSamples = [];
      const list = document.querySelector(".list");
      w.__leaveInterval = setInterval(() => {
        const el = list?.querySelector(".chat-leave-active");
        if (!el) return;
        const cs = getComputedStyle(el);
        w.__leaveSamples.push({
          opacity: parseFloat(cs.opacity),
          nickname: el.textContent ?? "",
        });
      }, 16);
    });

    await irc.sendMessage({
      id: "e2e-motion-leave-trigger-0001",
      displayName: "LeaveTriggerUser",
      message: "pushes the cap and trims the oldest message",
    });
    await expect(page.locator(".item")).toHaveCount(cap);
    // --motion-duration is 200ms; a generously longer window keeps this
    // from reading zero samples on a slow CI machine.
    await page.waitForTimeout(600);

    const samples = await page.evaluate(() => {
      const w = window as unknown as {
        __leaveSamples: { opacity: number; nickname: string }[];
        __leaveInterval: ReturnType<typeof setInterval>;
      };
      clearInterval(w.__leaveInterval);
      return w.__leaveSamples;
    });

    expect(
      samples.length,
      "expected at least one .chat-leave-active sample -- if this is 0, " +
        "the trim never happened or ran faster than the 16ms poll and the " +
        "assertion below is vacuous",
    ).toBeGreaterThan(0);

    // The actual observable that flips between the broken and fixed states:
    // with the bug, .chat-move's later `transition: transform ...` rule
    // clobbers .chat-leave-active's `opacity`/`translate` transition
    // entirely, so opacity only ever reads 1 then 0 -- never anything in
    // between. Fixed, it interpolates.
    expect(
      samples.some((s) => s.opacity > 0 && s.opacity < 1),
      "opacity never took a value strictly between 0 and 1 while " +
        `.chat-leave-active was present (samples: ${JSON.stringify(
          samples.map((s) => s.opacity),
        )}) -- the fade-out is snapping instead of interpolating, which is ` +
        "exactly what happens when a later .chat-move rule's `transition` " +
        "shorthand replaces .chat-leave-active's instead of both being " +
        "covered by one rule",
    ).toBe(true);

    // Pins WHICH message the cap drops: the trim removes from the top of
    // the bottom-anchored list, so the leaving element must be the oldest
    // fill message, not the newest or the just-arrived trigger message.
    expect(
      samples.every((s) => s.nickname.includes(fillMessages[0].displayName)),
      "expected the leaving element to be the oldest message " +
        `(${fillMessages[0].displayName}), but sampled nickname(s): ` +
        `${JSON.stringify(samples.map((s) => s.nickname))}`,
    ).toBe(true);
  });

  for (const theme of ALL_THEMES) {
    test(`theme=${theme}: FLIP move never introduces horizontal drift`, async ({
      page,
    }) => {
      const channel = `motion_move_${theme.replace(/[^a-z0-9]/gi, "_")}`;
      const { irc } = await openOverlay(page, {
        query: { theme },
        messages: [BASIC_MESSAGES[0], BASIC_MESSAGES[1]],
        irc: { channel },
      });

      // Tracks each `.chat-move` element's REAL rendered position
      // (`getBoundingClientRect().x`) against its own first-sampled x,
      // rather than parsing `getComputedStyle(el).transform`. That distinction
      // is load-bearing, not stylistic: `getComputedStyle().transform` only
      // ever echoes the `transform` CSS property's own value -- it does NOT
      // report the composition with an independent `rotate:`/`scale:`/
      // `translate:` property declared elsewhere, even though the browser
      // DOES paint that composition. Confirmed directly: reverting `cute`'s
      // `.motion-slot` wrapper (so `.item`, which carries `rotate: -1deg`, is
      // once again TransitionGroup's direct FLIP target) made
      // `getComputedStyle(el).transform` report a pure `matrix(1, 0, 0, 1, 0,
      // dy)` throughout the whole transition -- x always exactly 0 -- while
      // that same element's `getBoundingClientRect().x` measurably drifted by
      // ~2px (matching `dy * tan(1deg)` for the observed `dy`) before
      // settling back. So a `getComputedStyle`-based assertion would pass
      // whether or not the wrapper fix is present, on every rotated theme --
      // it cannot ever catch a regression here. `getBoundingClientRect()` is
      // what a viewer (or a pixel-diffing OBS capture) actually sees, so
      // that's what this test samples.
      await page.evaluate(() => {
        const w = window as unknown as {
          __moveFirstX: WeakMap<Element, number>;
          __moveMaxDrift: number;
          __moveSampleCount: number;
          __moveInterval: ReturnType<typeof setInterval>;
        };
        w.__moveFirstX = new WeakMap();
        w.__moveMaxDrift = 0;
        w.__moveSampleCount = 0;
        const list = document.querySelector(".list");
        w.__moveInterval = setInterval(() => {
          list?.querySelectorAll(".chat-move").forEach((el) => {
            const x = el.getBoundingClientRect().x;
            const firstX = w.__moveFirstX.get(el);
            if (firstX === undefined) {
              w.__moveFirstX.set(el, x);
            } else {
              w.__moveSampleCount++;
              w.__moveMaxDrift = Math.max(
                w.__moveMaxDrift,
                Math.abs(x - firstX),
              );
            }
          });
        }, 16);
      });

      await irc.sendMessage({
        id: `e2e-motion-move-${theme}-0001`,
        displayName: "MoveTriggerUser",
        message: "pushes earlier items up and triggers a FLIP move",
      });
      await expect(page.locator(".item")).toHaveCount(3);
      await page.waitForTimeout(500);

      const { maxDrift, sampleCount } = await page.evaluate(() => {
        const w = window as unknown as {
          __moveMaxDrift: number;
          __moveSampleCount: number;
          __moveInterval: ReturnType<typeof setInterval>;
        };
        clearInterval(w.__moveInterval);
        return {
          maxDrift: w.__moveMaxDrift,
          sampleCount: w.__moveSampleCount,
        };
      });

      expect(
        sampleCount,
        `theme=${theme}: expected at least one .chat-move element sampled ` +
          "more than once while earlier items reflow -- if this is 0, the " +
          "FLIP move never happened at all (or ran faster than the 16ms " +
          "poll) and the test below is vacuous",
      ).toBeGreaterThan(0);

      expect(
        maxDrift,
        `theme=${theme}: FLIP move introduced horizontal drift of ` +
          `${maxDrift}px on a .chat-move element's real rendered position. ` +
          "colorful/cute-* tilt .item via CSS rotate, and .motion-slot -- " +
          "an un-rotated wrapper, not .item itself -- is what TransitionGroup " +
          "actually repositions; a nonzero drift here means that wrapper " +
          "isn't doing its job and the dy*tan(theta) sideways-swing defect " +
          "(see those themes' DESIGN.md Motion sections) is back.",
      ).toBeLessThan(0.5);
    });
  }
});

test.describe("overlay: chat list motion honors prefers-reduced-motion", () => {
  test("under the suite's default reduced-motion context, an arriving message shows no intermediate translate offset", async ({
    page,
  }) => {
    const { irc } = await openOverlay(page, {
      query: { theme: "default" },
      messages: [BASIC_MESSAGES[0]],
      irc: { channel: "motion_reduced_translate_channel" },
    });

    const reducedMotionActive = await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    expect(reducedMotionActive).toBe(true);

    await page.evaluate(() => {
      const w = window as unknown as {
        __translateSamples: string[];
        __translateInterval: ReturnType<typeof setInterval>;
      };
      w.__translateSamples = [];
      const list = document.querySelector(".list");
      w.__translateInterval = setInterval(() => {
        const items = list?.querySelectorAll(".item");
        const last = items?.[items.length - 1];
        if (last) {
          w.__translateSamples.push(getComputedStyle(last).translate);
        }
      }, 8);
    });

    await irc.sendMessage({
      id: "e2e-motion-reduced-translate-0001",
      displayName: "ReducedMotionUser",
      message: "arrives under prefers-reduced-motion",
    });
    await expect(page.locator(".item")).toHaveCount(2);
    // Real (unforced) motion would take 200ms to settle; even collapsed to
    // 1ms this window leaves ample margin to have sampled throughout.
    await page.waitForTimeout(300);

    const samples = await page.evaluate(() => {
      const w = window as unknown as {
        __translateSamples: string[];
        __translateInterval: ReturnType<typeof setInterval>;
      };
      clearInterval(w.__translateInterval);
      return w.__translateSamples;
    });

    expect(samples.length).toBeGreaterThan(0);
    for (const s of samples) {
      expect(
        s,
        "prefers-reduced-motion should force translate:none throughout " +
          `the enter transition, but observed "${s}"`,
      ).toBe("none");
    }
  });
});
