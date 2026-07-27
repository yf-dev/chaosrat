import { test, expect, type Page } from "@playwright/test";
import { openOverlay, openBuilderPage } from "./fixtures/overlay";
import {
  BASIC_MESSAGES,
  RICH_MESSAGE,
  STICKER_MESSAGE,
  KOREAN_WRAP_MESSAGES,
  MINIMAL_MESSAGE,
} from "./fixtures/chatFixtures";
import type { TwitchIrcSendMessageOptions } from "./fixtures/twitchIrc";
import { captureStyleFingerprint } from "./fixtures/styleFingerprint";
import type { ChatTheme } from "../../lib/interfaces";

/**
 * Prevents an unintended visual change to any chat theme from slipping
 * through during development, via two independent layers per scenario:
 *
 * 1. A pixel screenshot (`toHaveScreenshot`), captured with a transparent
 *    background (`omitBackground: true` -- confirmed supported by
 *    @playwright/test@1.61.0's `PageAssertions.toHaveScreenshot`, so no
 *    `page.screenshot()` fallback was needed). The transparent canvas is
 *    part of the overlay contract (root DESIGN.md, Overlay Contract & Theme
 *    Map #1); capturing alpha means a regression that paints an opaque
 *    background actually fails the snapshot instead of hiding behind
 *    Playwright's default white backdrop.
 * 2. A computed-style + geometry fingerprint (`styleFingerprint.ts`),
 *    asserted as a text snapshot. Where a failing pixel diff only reports
 *    "N pixels differ", the fingerprint names the exact selector and CSS
 *    property that moved -- the same verification shape commit eba5b68
 *    used (66 computed properties across every theme selector, plus cute's
 *    pseudo-elements) when it rejected pixel diffing outright, because at
 *    the time the overlay always rendered live chat and no two captures
 *    ever shared content. This suite's fixtures (fixed message ids and
 *    nicknames, so `cute`'s per-id hash and `pure`'s per-nickname hash are
 *    stable; no emoji glyphs, since the emoji font differs per environment)
 *    remove that objection, which is what makes layer 1 viable at all --
 *    but layer 2 is kept because a name beats a pixel count when a snapshot
 *    fails six months from now.
 */

/**
 * Drives the matrix from a `Record<ChatTheme, true>` rather than a
 * hand-written array literal: if `ChatTheme` (app/lib/interfaces.ts) gains a
 * new member, this object literal is missing a property and `npm run
 * typecheck` (vue-tsc) fails the build instead of the new theme silently
 * going unsnapshotted. `ls -d app/components/themes/*\/` is the command that
 * enumerates the design systems this maps to -- `cute` covers both the
 * `cute-left` and `cute-right` query values (root DESIGN.md's theme map:
 * "one design system, not two").
 */
const THEMES: Record<ChatTheme, true> = {
  default: true,
  simple: true,
  pure: true,
  colorful: true,
  "video-master": true,
  "cute-left": true,
  "cute-right": true,
};
const THEME_LIST = Object.keys(THEMES) as ChatTheme[];

/**
 * OBS Browser Source width/height are set by the streamer per source, not by
 * this app: a narrow vertical strip run alongside gameplay, a short
 * full-width ticker along the bottom of the frame, and a full-screen overlay
 * are all real production configurations, and nothing in this suite
 * exercised any of them before this matrix -- every scenario above ran only
 * at the config's default 1280x720 (`playwright.config.ts`'s project
 * `viewport`, which the non-responsive scenarios above -- basic/rich/
 * sticker/isHidePlatformIcon/builder page -- still capture at; that default
 * is deliberately left alone). `xs`/`narrow-tall`/`wide-short`/`xl` are this
 * matrix's four corners; `standard` is a fifth, deliberately-distinct point
 * the owner picked as a common small/narrow OBS source size -- it is *not*
 * the same as the project default despite the name and the shared 720
 * height, so don't conflate the two when reading a `standard` result. One
 * `Record` so a sixth viewport is a one-line addition here, not a spec
 * rewrite.
 */
const VIEWPORTS: Record<string, { width: number; height: number }> = {
  xs: { width: 240, height: 180 }, // narrowest and shortest -- the hardest case
  "narrow-tall": { width: 240, height: 1920 }, // narrow vertical strip beside gameplay; tall enough that the captured list isn't clipped at the top
  "wide-short": { width: 1280, height: 180 }, // full-width bottom ticker strip
  standard: { width: 480, height: 720 }, // a small, narrow OBS source size distinct from the 1280x720 project default
  xl: { width: 1920, height: 1080 }, // full 1080p overlay
};
const VIEWPORT_LIST = Object.keys(VIEWPORTS);

interface Scenario {
  name: string;
  messages: TwitchIrcSendMessageOptions[];
  query?: Record<string, string>;
  /** Sticker splicing resolves asynchronously -- see the explicit wait in
   * `captureCase` below -- so scenarios that use `STICKER_MESSAGE` must set
   * this. */
  waitForSticker?: boolean;
}

// `--chat-sticker-size` is a cross-theme overlay-contract value (root
// DESIGN.md, Overlay Contract & Theme Map #3: "stickers at
// {spacing.sticker} (10rem)"), not a per-theme decision -- tested on every
// theme rather than a sample, since a sticker-sizing regression on any one
// theme is exactly what this suite exists to catch. Pulled out to a named
// constant (rather than inlined in `SCENARIOS` below) because the responsive
// matrix further down reuses it verbatim at the `xs` viewport.
const STICKER_SCENARIO: Scenario = {
  name: "sticker",
  messages: [STICKER_MESSAGE],
  query: { isUseOpenDcconSelector: "true" },
  waitForSticker: true,
};

const SCENARIOS: Scenario[] = [
  // Nickname/message layout: mixed short/long nicknames, ASCII + Hangul
  // wrapping, three messages stacked bottom-anchored.
  { name: "basic", messages: BASIC_MESSAGES },
  // Badges + emote + text long enough to wrap across multiple lines.
  { name: "rich", messages: [RICH_MESSAGE] },
  STICKER_SCENARIO,
];

// `KOREAN_WRAP_MESSAGES` (see chatFixtures.ts) is the single most
// layout-stressing fixture in this file on purpose: one long space-delimited
// Korean sentence (word-level wrap), one 90-character unbroken Hangul run
// (word-break stress), one long unbroken ASCII/URL token mixed with Korean
// text (overflow-wrap stress, contrasted against the Hangul run since Latin
// and Hangul break under different rules), and one very long Korean
// nickname (nickname-cell layout, separate from message-body layout). Used
// by the responsive viewport matrix below.
const KOREAN_WRAP_SCENARIO: Scenario = {
  name: "korean-wrap",
  messages: KOREAN_WRAP_MESSAGES,
};

// `MINIMAL_MESSAGE` (see chatFixtures.ts) is the opposite extreme from
// `KOREAN_WRAP_SCENARIO`: a single-character nickname and message, rendered
// alone so a taller neighbouring message can't mask the layout case it
// exists to isolate (padding, min-widths, border-radius, and the icon/badge
// row all show up disproportionately against one glyph). Used by the
// responsive viewport matrix below, same as `KOREAN_WRAP_SCENARIO`.
const MINIMAL_SCENARIO: Scenario = {
  name: "minimal",
  messages: [MINIMAL_MESSAGE],
};

/**
 * `img.decode()` resolves once an image is fully decoded and safe to paint.
 * Badges, the Twitch emote, and the sticker are all real `<img src>`
 * fetches against the hermetic network stub (`fixtures/network.ts`); without
 * this wait, a screenshot taken right after layout looks stable can race a
 * still-decoding image and flake between otherwise-identical runs.
 */
async function waitForImagesDecoded(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll(".chat-container img"));
    await Promise.all(
      imgs.map((img) =>
        "decode" in img
          ? (img as HTMLImageElement).decode().catch(() => undefined)
          : Promise.resolve(),
      ),
    );
  });
}

/** Shared setup for both `captureCase` and `captureResponsiveCase`: navigate,
 * send the scenario's messages, and wait for images/stickers to settle. */
async function renderScenario(
  page: Page,
  theme: ChatTheme,
  scenario: Scenario,
  extraQuery: Record<string, string> = {},
): Promise<void> {
  await openOverlay(page, {
    query: { theme, ...scenario.query, ...extraQuery },
    messages: scenario.messages,
  });

  if (scenario.waitForSticker) {
    // The sticker splice depends on `useOpenDcconSelector`'s async fetch
    // chain (dccon-url -> dccon document -> `stickerItems`), which starts at
    // mount and is not tied to message arrival -- `openOverlay`'s `.item`
    // count wait only proves the message rendered, not that the `~pepe`
    // marker has been replaced with the sticker `<img>` yet.
    await expect(page.locator(".chat-container img.sticker")).toHaveCount(1);
  }
  await waitForImagesDecoded(page);
}

async function captureCase(
  page: Page,
  theme: ChatTheme,
  scenario: Scenario,
  extraQuery: Record<string, string> = {},
): Promise<void> {
  await renderScenario(page, theme, scenario, extraQuery);

  const snapshotName = `${theme}__${scenario.name}`;
  await expect(page).toHaveScreenshot(`${snapshotName}.png`, {
    omitBackground: true,
  });

  const fingerprint = await captureStyleFingerprint(page);
  expect(fingerprint).toMatchSnapshot(`${snapshotName}.fingerprint.txt`);
}

/**
 * OBS Browser Sources have no page-level scrollbar a viewer could use to
 * reach clipped content -- anything wider than the declared source width is
 * just gone, not merely inconvenient to reach. `body.chat` (pages/chat.vue)
 * sets `width: 100vw; overflow: hidden`, which clips the *rendered* overflow
 * but not the underlying content's layout size -- `scrollWidth` reports that
 * natural width regardless of an ancestor's `overflow: hidden`, so it still
 * catches a child wider than the viewport even though nothing visibly
 * scrolls. This is the guard the 240px-wide viewports in `VIEWPORTS` exist
 * to exercise: a 100px sticker (`STICKER_SCENARIO`) or `video-master`'s
 * fixed 90px icon column are exactly where a 240px frame runs out of room.
 *
 * `overflowCeiling`, when given, relaxes the assertion from "no overflow at
 * all" to "no *more* overflow than this many px of `scrollWidth`" -- see
 * `COLORFUL_ROTATION_OVERFLOW` below for the one family of pre-existing,
 * deliberately-unfixed cases that pass this. It is still a guard, not an
 * allowance: a future change that grows the overflow past the recorded
 * ceiling fails here exactly like a fresh regression would.
 */
async function expectNoHorizontalOverflow(
  page: Page,
  overflowCeiling?: number,
): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  if (overflowCeiling === undefined) {
    expect(
      scrollWidth,
      "page must not overflow horizontally -- OBS crops it silently, there is no scrollbar",
    ).toBeLessThanOrEqual(innerWidth);
    return;
  }
  expect(
    scrollWidth,
    `recorded pre-existing overflow (see COLORFUL_ROTATION_OVERFLOW) must not grow past its recorded ceiling of ${overflowCeiling}px`,
  ).toBeLessThanOrEqual(overflowCeiling);
}

/**
 * Same two-layer verification as `captureCase`, but named per viewport and
 * using the fingerprint's `"layout"` mode (`styleFingerprint.ts`'s
 * `LAYOUT_PROPERTIES`) instead of the full property set: a viewport change
 * can only move geometry and wrapping/overflow-related properties, so the
 * full ~60-property set (color, shadow, border, transform, ...) would be
 * pure repetition five times over. Snapshot names are prefixed with the
 * scenario name last (`theme__viewport__scenario`) so all of one theme's
 * viewports sort together in the snapshot directory.
 */
async function captureResponsiveCase(
  page: Page,
  theme: ChatTheme,
  viewportName: string,
  scenario: Scenario,
): Promise<void> {
  await renderScenario(page, theme, scenario);

  // Only `colorful` has any recorded ceiling; every other theme keeps the
  // strict `overflowCeiling === undefined` path in `expectNoHorizontalOverflow`
  // above.
  const overflowCeiling =
    theme === "colorful"
      ? COLORFUL_ROTATION_OVERFLOW.get(`${viewportName}|${scenario.name}`)
      : undefined;
  await expectNoHorizontalOverflow(page, overflowCeiling);

  const snapshotName = `${theme}__${viewportName}__${scenario.name}`;
  await expect(page).toHaveScreenshot(`${snapshotName}.png`, {
    omitBackground: true,
  });

  const fingerprint = await captureStyleFingerprint(
    page,
    ".chat-container",
    "layout",
  );
  expect(fingerprint).toMatchSnapshot(`${snapshotName}.fingerprint.txt`);
}

test.describe("visual / per-theme snapshots", () => {
  for (const theme of THEME_LIST) {
    test.describe(theme, () => {
      for (const scenario of SCENARIOS) {
        test(scenario.name, async ({ page }) => {
          await captureCase(page, theme, scenario);
        });
      }
    });
  }

  // `isHidePlatformIcon` is part of the overlay contract (root DESIGN.md,
  // Overlay Contract & Theme Map #4: "honored wherever a platform icon is
  // rendered"). One representative theme is enough to pin that the icon
  // element disappears from the DOM entirely (both the pixel snapshot and
  // the fingerprint -- which would otherwise still list an `.icon` line --
  // catch a regression that renders it hidden-but-present instead).
  test("default theme honors isHidePlatformIcon", async ({ page }) => {
    await captureCase(
      page,
      "default",
      { name: "basic-hide-platform-icon", messages: BASIC_MESSAGES },
      { isHidePlatformIcon: "true" },
    );
  });
});

/**
 * `expectNoHorizontalOverflow` used to have a `KNOWN_HORIZONTAL_OVERFLOW`
 * map of `test.fixme` exceptions here, dominated by one mechanism: with
 * `overflow-wrap: break-word`, a nickname (no internal spaces, so
 * `word-break: keep-all` treats it as one unbreakable run) inflated
 * `.nickname`'s shrink-to-fit min-content width, because `break-word` does
 * not reduce a box's min-content contribution -- only `overflow-wrap:
 * anywhere` does. Switching every theme's `.chat-container` to
 * `overflow-wrap: anywhere` (see the theme `.vue` files and their
 * `DESIGN.md`s) fixed that at the source: it took `default`/`simple`/
 * `pure`/`video-master`/`cute-left`/`cute-right` at every viewport, and
 * `colorful` at `wide-short`/`xl`, from several-hundred-px overflow to
 * zero.
 *
 * A much smaller, separate overflow remains in `colorful` at narrow
 * viewports, and it is **not** a text-wrapping issue at all -- confirmed by
 * isolating each `KOREAN_WRAP_MESSAGES` fixture alone at the `xs` viewport:
 * even `LONG_KOREAN_SENTENCE_MESSAGE` (an ordinary space-delimited
 * sentence, ~10-12px over) overflows on its own, and the same ~10px
 * persists with `.chat-container` reverted to `overflow-wrap: break-word`
 * for comparison. The cause is `.item`'s `transform: rotateZ(-3deg)`
 * (`ColorfulChatList.vue`) and the message card's own nested
 * `rotateZ(-2deg)`: a rotated box's painted bounds extend further
 * horizontally the *taller* it is, and it is content *height* (how many
 * lines the message wraps to), not the wrapping rule, that drives the
 * overflow here -- so it is present with either `overflow-wrap` value and
 * predates `word-break: keep-all` entirely (matching what
 * `KNOWN_HORIZONTAL_OVERFLOW` used to call colorful's "9-14px, predates
 * keep-all" secondary overflow). Fixing it would mean touching layout
 * properties beyond `overflow-wrap`, which is out of scope here -- see
 * `COLORFUL_ROTATION_OVERFLOW` below for the current per-viewport
 * measurements.
 *
 * The `colorful` `xs` `sticker` case is the same rotation mechanism at
 * work on a non-text element (`--chat-sticker-size` is a 100px sticker,
 * plus margin, plus `.item`'s rotation, inside a 240px-wide viewport) --
 * also pre-existing, also unrelated to text wrapping.
 *
 * This used to be a `test.fixme` map, which skipped these four combinations
 * entirely -- no screenshot, no fingerprint, nothing to catch a *second*,
 * unrelated regression riding along with the known one. Skipping the whole
 * test to document a few px of overflow was the wrong trade: the pixel
 * snapshot and style fingerprint are this suite's primary value, and losing
 * both at three of five viewports just to silence one assertion gave up far
 * more coverage than it recorded. Instead, each entry below is a recorded
 * **ceiling** in px of `document.documentElement.scrollWidth` -- see
 * `expectNoHorizontalOverflow`'s `overflowCeiling` parameter -- so the test
 * still runs its full capture, and still fails if the overflow this
 * mechanism produces ever grows past what was measured here. These values
 * are ceilings for *this* rotation-driven condition only, at *these* exact
 * theme/viewport/scenario combinations -- they are not a general allowance,
 * and every other combination (including `colorful` at every other
 * viewport/scenario) still requires zero overflow via the strict path in
 * `expectNoHorizontalOverflow`. Re-measured directly against
 * `document.documentElement.scrollWidth` / `window.innerWidth` on 2026-07-27:
 */
const COLORFUL_ROTATION_OVERFLOW = new Map<string, number>([
  ["xs|korean-wrap", 252], // scrollWidth=252 vs innerWidth=240
  ["narrow-tall|korean-wrap", 252], // scrollWidth=252 vs innerWidth=240
  ["standard|korean-wrap", 482], // scrollWidth=482 vs innerWidth=480
  ["xs|sticker", 242], // scrollWidth=242 vs innerWidth=240
]);

/**
 * The OBS Browser Source dimensions this app actually runs inside are set by
 * the streamer, not this app (see `VIEWPORTS` above), and until now nothing
 * in this suite rendered any theme at anything but the config's default
 * 1280x720 -- a layout that collapses at 240px wide or clips at 180px tall
 * would ship unnoticed. This block is deliberately narrow in *which*
 * fixtures it repeats across the matrix, not in which themes or viewports:
 *
 * - `KOREAN_WRAP_SCENARIO` and `MINIMAL_SCENARIO` run on every theme at
 *   every viewport. They are the two content extremes deliberately
 *   multiplied across the full matrix -- re-running `basic`/`rich`/
 *   `sticker`/`isHidePlatformIcon` at every viewport too would multiply
 *   this suite's snapshot count several times over for very little extra
 *   signal. `KOREAN_WRAP_SCENARIO` is the single most layout-stressing
 *   *maximum*-content case in this file (a long wrapped sentence, an
 *   unbroken 90-character Hangul run, an unbroken ASCII/URL run, and a
 *   very long nickname, all in one capture -- see `chatFixtures.ts`);
 *   `MINIMAL_SCENARIO` is the opposite extreme, a one-character nickname
 *   and message, which stresses padding/min-width/border-radius instead of
 *   wrapping.
 * - `STICKER_SCENARIO` gets one deliberate exception: every theme, but only
 *   at the `xs` viewport. `--chat-sticker-size` (10rem = 100px) is a named
 *   cross-theme overlay-contract value (root DESIGN.md, Overlay Contract &
 *   Theme Map #3), and a 100px sticker inside a 240px-wide frame is a
 *   concrete, worth-pinning-explicitly contract stress -- not a hypothetical
 *   one, since 240px is this matrix's narrowest viewport.
 *
 * Each viewport is applied via `test.use({ viewport })` at the per-viewport
 * `describe` level (confirmed to actually change the rendered/captured size
 * against this project's `devices["Desktop Chrome"]` base, unlike some
 * alternatives that only affect the reported `page.viewportSize()` without
 * relayout).
 */
test.describe("visual / responsive viewport matrix", () => {
  for (const viewportName of VIEWPORT_LIST) {
    test.describe(viewportName, () => {
      test.use({ viewport: VIEWPORTS[viewportName] });

      for (const theme of THEME_LIST) {
        test.describe(theme, () => {
          test(KOREAN_WRAP_SCENARIO.name, async ({ page }) => {
            await captureResponsiveCase(
              page,
              theme,
              viewportName,
              KOREAN_WRAP_SCENARIO,
            );
          });

          test(MINIMAL_SCENARIO.name, async ({ page }) => {
            await captureResponsiveCase(
              page,
              theme,
              viewportName,
              MINIMAL_SCENARIO,
            );
          });

          if (viewportName === "xs") {
            test(STICKER_SCENARIO.name, async ({ page }) => {
              await captureResponsiveCase(
                page,
                theme,
                viewportName,
                STICKER_SCENARIO,
              );
            });
          }
        });
      }
    });
  }
});

test.describe("visual / builder page", () => {
  // The builder page's content is static -- no live chat, no per-run
  // variance -- so a plain full-page pixel snapshot is a stable baseline:
  // commit eba5b68 recorded its capture as byte-identical before and after
  // a large token refactor. No computed-style fingerprint layer here: the
  // curated property list in styleFingerprint.ts was built from the chat
  // overlay themes' own CSS, not chota's, so it isn't the right tool for
  // this page's markup.
  test("renders the same as the last snapshot", async ({ page }) => {
    await openBuilderPage(page);
    await expect(page).toHaveTitle("ChaosRat - 채팅 오버레이 URL 생성");
    await expect(page).toHaveScreenshot("builder-page.png");
  });
});
