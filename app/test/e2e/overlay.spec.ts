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
// sanitize-html/XSS boundary and the seven-theme switch.

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

test.describe("overlay: sanitize-html / DOM-XSS boundary", () => {
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

    // sanitize-html's default config allows neither <img> nor <script>, so
    // neither element -- nor anything they'd execute -- should exist.
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
    // emoji/sticker URLs into `src="..."` *after* sanitize-html had
    // already run over chat.message, so the sanitizer never saw the URL
    // content at all. A sticker path containing a `"` broke out of the
    // attribute and injected an arbitrary attribute (e.g. onerror) on the
    // resulting <img>. lib/utils.ts's stickerToTag now runs the URL
    // through escapeHtmlAttribute() first.
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
