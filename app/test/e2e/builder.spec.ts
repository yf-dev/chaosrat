import { test, expect } from "@playwright/test";
import { openBuilderPage } from "./fixtures/overlay";
import { decodeUrlSafeBase64 } from "../../lib/utils";

// Exercises the URL builder page (`pages/index.vue`). Its entire job is
// turning form input into an overlay query string -- see the "Options are
// URL state" architecture note in CLAUDE.local.md -- so most assertions
// here read `#chatOverlayUrl`'s value and parse it as a URL rather than
// asserting anything about the live-preview iframe's internals.
//
// `openBuilderPage` installs the hermetic network stub; `/api/chzzk/me` is
// same-origin and, with no `chzzk_access_token` cookie set, returns
// `{status:"ERROR", code:"not_logged_in"}` from the real dev server without
// any outbound network call (see server/api/chzzk/me.ts) -- so every test
// below lands on a deterministic logged-out state with no extra mocking.
//
// Reaching the logged-in branch would additionally require mocking a fetch
// that server/api/chzzk/me.ts issues to https://openapi.chzzk.naver.com
// from *inside the Nuxt dev server process*, not from the browser page --
// Playwright's `page.route` only intercepts requests the page itself
// issues, so that call is unreachable from here. See the final report for
// this limitation.

function chatOverlayUrlValue(page: import("@playwright/test").Page) {
  return page.locator("#chatOverlayUrl").inputValue();
}

// Nuxt SSR-renders the builder page's form markup immediately, but Vue
// only wires up its `@input`/`@change`/`@click` handlers once client-side
// hydration finishes. Playwright's actionability checks (visible, stable,
// enabled) do not know about hydration, so a `.fill()`/`.check()` fired in
// that window lands on a DOM node with no listener yet and is silently
// dropped -- confirmed by reproducing it directly: the exact same
// `.fill("#twitchChannel", ...)` that is flaky right after `page.goto`
// becomes reliable with a `waitForLoadState("networkidle")` (or even a bare
// timeout) inserted first. `openBuilderPage` (test/e2e/fixtures/overlay.ts)
// cannot be changed here, so every test in this file goes through this
// wrapper instead of calling `openBuilderPage` directly.
async function openReadyBuilderPage(page: import("@playwright/test").Page) {
  const handle = await openBuilderPage(page);
  await page.waitForLoadState("networkidle");
  return handle;
}

test.describe("builder: channel inputs + theme -> generated URL", () => {
  test("filling channel inputs and selecting a theme produces exactly the expected query params", async ({
    page,
  }) => {
    await openReadyBuilderPage(page);

    await page.locator("#twitchChannel").fill("sleeping_ce");
    await page.locator("#youtubeHandle").fill("@sleeping.c.elegans");
    await page.locator("#kickChannel").fill("sleeping-c-elegans");
    await page.locator("#theme").selectOption("cute-left");

    const urlValue = await chatOverlayUrlValue(page);
    const url = new URL(urlValue);

    expect(url.pathname).toBe("/chat");
    // Every param present must be exactly the expected value, and no
    // unexpected param (e.g. a leftover default) may sneak in.
    expect(Object.fromEntries(url.searchParams.entries())).toEqual({
      twitchChannel: "sleeping_ce",
      youtubeHandle: "@sleeping.c.elegans",
      kickChannel: "sleeping-c-elegans",
      theme: "cute-left",
    });
  });

  test("the default theme is never written to the URL", async ({ page }) => {
    await openReadyBuilderPage(page);
    await page.locator("#twitchChannel").fill("some_channel");

    // theme starts as "default" and is never touched.
    const url = new URL(await chatOverlayUrlValue(page));
    expect(url.searchParams.has("theme")).toBe(false);
  });

  test("chzzkChannelId is never present while logged out, and the login control is the only way to populate it", async ({
    page,
  }) => {
    await openReadyBuilderPage(page);

    const url = new URL(await chatOverlayUrlValue(page));
    expect(url.searchParams.has("chzzkChannelId")).toBe(false);

    // There is no free-text chzzkChannelId input in the builder UI at all
    // -- it is only ever populated from a successful Chzzk login
    // (`chzzkChannelId.value = response.channelId` in pages/index.vue's
    // onMounted/loginToChzzk). Confirm that absence directly rather than
    // assuming it.
    await expect(page.locator("#chzzkChannelId")).toHaveCount(0);
  });
});

test.describe("builder: boolean flags are omitted, never written as =false", () => {
  // stores/useChatOptionsStore.ts's parseBooleanFlag comment states the
  // builder "never emits '=false'" as load-bearing fact that the store's
  // parsing logic was written around. If the builder ever started emitting
  // `key=false` for an unchecked box, parseBooleanFlag would still parse it
  // correctly (it special-cases "false"/"0"), so a unit test of the store
  // could never see this regression -- only reading the actual generated
  // URL string, as this test does, can.

  test("isHidePlatformIcon: checked -> literal 'true' in the URL, unchecked -> key omitted entirely", async ({
    page,
  }) => {
    await openReadyBuilderPage(page);
    await page.locator("#twitchChannel").fill("some_channel");

    const checkbox = page.locator("#isHidePlatformIcon");
    await expect(checkbox).not.toBeChecked();

    // Baseline: unchecked from the start -> no key at all.
    let url = new URL(await chatOverlayUrlValue(page));
    expect(url.searchParams.has("isHidePlatformIcon")).toBe(false);

    await checkbox.check();
    await expect(checkbox).toBeChecked();
    url = new URL(await chatOverlayUrlValue(page));
    expect(url.searchParams.get("isHidePlatformIcon")).toBe("true");

    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
    url = new URL(await chatOverlayUrlValue(page));
    // Not "false" -- entirely absent.
    expect(url.searchParams.has("isHidePlatformIcon")).toBe(false);
    expect(urlValueDoesNotContain(url, "isHidePlatformIcon")).toBe(true);
  });

  test("isUseOpenDcconSelector: checked -> literal 'true' in the URL, unchecked -> key omitted entirely", async ({
    page,
  }) => {
    await openReadyBuilderPage(page);
    // The checkbox is disabled until a Twitch channel is set (see the
    // `:disabled="!twitchChannel"` binding in pages/index.vue).
    const checkbox = page.locator("#isUseOpenDcconSelector");
    await expect(checkbox).toBeDisabled();
    await page.locator("#twitchChannel").fill("some_channel");
    await expect(checkbox).toBeEnabled();

    let url = new URL(await chatOverlayUrlValue(page));
    expect(url.searchParams.has("isUseOpenDcconSelector")).toBe(false);

    await checkbox.check();
    url = new URL(await chatOverlayUrlValue(page));
    expect(url.searchParams.get("isUseOpenDcconSelector")).toBe("true");

    await checkbox.uncheck();
    url = new URL(await chatOverlayUrlValue(page));
    expect(url.searchParams.has("isUseOpenDcconSelector")).toBe(false);
  });
});

function urlValueDoesNotContain(url: URL, needle: string): boolean {
  return !url.toString().includes(needle);
}

test.describe("builder: regex fields are url-safe-base64 encoded", () => {
  test("hiddenUsernameRegex and hiddenMessageRegex round-trip through decodeUrlSafeBase64", async ({
    page,
  }) => {
    await openReadyBuilderPage(page);

    const usernamePattern = "^admin.*$";
    // Deliberately includes characters (+, /, spaces) that differ between
    // standard and url-safe base64 alphabets, so a regression to plain
    // base64 (which is not URL-safe) would be caught by the round-trip
    // assertion below even before considering the raw query string.
    const messagePattern = "\\bspam\\b|foo bar+/baz";

    await page.locator("#hiddenUsernameRegex").fill(usernamePattern);
    await page.locator("#hiddenMessageRegex").fill(messagePattern);

    const url = new URL(await chatOverlayUrlValue(page));
    const encodedUsername = url.searchParams.get("hiddenUsernameRegex");
    const encodedMessage = url.searchParams.get("hiddenMessageRegex");

    expect(encodedUsername).not.toBeNull();
    expect(encodedMessage).not.toBeNull();
    // Not literally the plain pattern -- it must actually be encoded.
    expect(encodedUsername).not.toBe(usernamePattern);
    expect(encodedMessage).not.toBe(messagePattern);

    expect(decodeUrlSafeBase64(encodedUsername!)).toBe(usernamePattern);
    expect(decodeUrlSafeBase64(encodedMessage!)).toBe(messagePattern);
  });

  test("empty regex fields are omitted from the URL", async ({ page }) => {
    await openReadyBuilderPage(page);
    const url = new URL(await chatOverlayUrlValue(page));
    expect(url.searchParams.has("hiddenUsernameRegex")).toBe(false);
    expect(url.searchParams.has("hiddenMessageRegex")).toBe(false);
  });
});

test.describe("builder: live preview reflects the selected theme", () => {
  test("changing the theme select changes the preview iframe's src theme param", async ({
    page,
  }) => {
    await openReadyBuilderPage(page);
    await page.locator("#twitchChannel").fill("preview_channel");

    const iframe = page.locator("iframe.chat-overlay");
    await expect(iframe).toHaveAttribute(
      "src",
      /^http:\/\/localhost:3000\/chat\?/,
    );

    // Default theme -> no `theme` param on the iframe src either.
    let src = await iframe.getAttribute("src");
    expect(new URL(src!).searchParams.has("theme")).toBe(false);

    await page.locator("#theme").selectOption("video-master");
    src = await iframe.getAttribute("src");
    expect(new URL(src!).searchParams.get("theme")).toBe("video-master");

    // The iframe src and the displayed #chatOverlayUrl value must always
    // agree -- both derive from the same `chatOverlayUrl` computed.
    expect(await chatOverlayUrlValue(page)).toBe(src);
  });
});

test.describe("builder: accessibility regressions fixed in eba5b68 stay fixed", () => {
  test("the Chzzk login control is a real <button> and is keyboard-focusable / in the tab order", async ({
    page,
  }) => {
    await openReadyBuilderPage(page);

    // Before the fix this was an `<a>` with no `href`, which has no
    // implicit ARIA role of "button" and is not part of the tab order --
    // `getByRole("button", ...)` would fail to locate it, and calling
    // `.focus()` on such an element is a no-op (document.activeElement
    // stays on <body>). Both assertions below are meaningless if the
    // control regresses back to a bare non-interactive <a>.
    const loginButton = page.getByRole("button", { name: "치지직 로그인" });
    await expect(loginButton).toBeVisible();

    await loginButton.focus();
    await expect(loginButton).toBeFocused();

    const tagName = await loginButton.evaluate((el) => el.tagName);
    expect(tagName).toBe("BUTTON");

    // The logged-in variant (a "로그아웃" button, also converted from <a>
    // to <button> in the same commit) uses an identical
    // `<button class="link" type="button">` pattern in the same template
    // branch, but reaching that branch requires a successful Chzzk login,
    // which needs a real access-token cookie whose validity is checked by
    // a fetch issued from *inside the Nuxt dev server process*
    // (server/api/chzzk/me.ts calling openapi.chzzk.naver.com) -- not
    // interceptable via page.route. Not independently exercised here; see
    // the final report.
  });

  test("the custom sound-effect URL input has a real associated label", async ({
    page,
  }) => {
    await openReadyBuilderPage(page);

    await page.locator("#soundEffectType").selectOption("custom");

    // Before the fix this input had only a placeholder, no <label for=...>
    // -- getByLabel would fail to resolve it by accessible name.
    const customUrlInput = page.getByLabel("효과음 URL");
    await expect(customUrlInput).toBeVisible();
    await expect(customUrlInput).toHaveId("soundEffectCustomUrl");

    await customUrlInput.fill("https://example.com/sound-effect.mp3");
    await expect(customUrlInput).toHaveValue(
      "https://example.com/sound-effect.mp3",
    );
  });

  test("the '기타 옵션' group is a fieldset/legend exposing an accessible group name", async ({
    page,
  }) => {
    await openReadyBuilderPage(page);

    // Before the fix this was a bare <label> with no `for`, which has no
    // ARIA "group" role at all -- getByRole("group", ...) would fail to
    // find anything.
    const group = page.getByRole("group", { name: "기타 옵션" });
    await expect(group).toBeVisible();

    // The checkboxes must be reachable as members of that accessible
    // group's subtree, addressable by their own labels.
    await expect(
      group.getByLabel("Open Dccon Selector에서 스티커 불러오기", {
        exact: false,
      }),
    ).toHaveCount(1);
    await expect(group.getByLabel("플랫폼 아이콘 숨기기")).toHaveCount(1);
  });
});
