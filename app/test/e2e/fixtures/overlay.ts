import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import {
  installTwitchIrcMock,
  type TwitchIrcMock,
  type TwitchIrcSendMessageOptions,
  type InstallTwitchIrcMockOptions,
} from "./twitchIrc";
import {
  stubExternalNetwork,
  type NetworkStubHandle,
  type StubExternalNetworkOptions,
} from "./network";

/**
 * Only `colorful`/`cute-left`/`cute-right` actually reference
 * `--font-family-display` (`ONE-Mobile-POP`) anywhere in their CSS --
 * verified empirically (not from reading the CSS alone) by loading
 * `/chat?theme=<x>` for each theme and checking `document.fonts.check(...)`:
 * it stays `false` even after `document.fonts.ready` resolves until an
 * element actually using that font-family exists in the DOM with text in
 * it, because browsers fetch `@font-face` resources lazily, on first
 * matched use, not eagerly on stylesheet parse. So for `default`/`simple`/
 * `pure`/`video-master` the font is legitimately never requested, and for
 * every theme (including the font-dependent ones) it is not requested until
 * at least one chat item with a nickname is actually rendered.
 */
const FONT_DEPENDENT_THEMES = new Set(["colorful", "cute-left", "cute-right"]);

export interface OpenOverlayOptions {
  /** Query string params, WITHOUT the leading '?'. `twitchChannel` is
   * filled in from `irc.channel` (or its own default) if omitted. */
  query?: Record<string, string>;
  /** Sent, in order, once the IRC mock reports `connected`. */
  messages?: TwitchIrcSendMessageOptions[];
  network?: StubExternalNetworkOptions;
  irc?: InstallTwitchIrcMockOptions;
}

export interface OverlayHandle {
  irc: TwitchIrcMock;
  network: NetworkStubHandle;
}

/**
 * Installs the network stub + Twitch IRC mock, navigates to
 * `/chat?<query>`, waits for tmi.js to report `connected`, sends
 * `messages` (if any) and waits for the matching number of `.item`
 * elements to render, then waits on `document.fonts.ready` and -- only for
 * a font-dependent theme with at least one message sent -- asserts the
 * `ONE-Mobile-POP` webfont actually loaded (see `FONT_DEPENDENT_THEMES`
 * above for why the check is conditional rather than universal).
 *
 * Returns the IRC mock handle so a test can `.sendMessage()` further
 * messages afterwards (e.g. to test `!!clear`, bans, deletions).
 */
export async function openOverlay(
  page: Page,
  options: OpenOverlayOptions = {},
): Promise<OverlayHandle> {
  const query = { ...(options.query ?? {}) };
  const channel = query.twitchChannel ?? options.irc?.channel ?? "e2e_channel";
  query.twitchChannel = channel;
  const theme = query.theme ?? "default";

  const network = await stubExternalNetwork(page, options.network);
  const irc = await installTwitchIrcMock(page, { ...options.irc, channel });

  const search = new URLSearchParams(query).toString();
  await page.goto(`/chat?${search}`);

  await irc.waitForConnected();

  const messages = options.messages ?? [];
  if (messages.length > 0) {
    for (const message of messages) {
      await irc.sendMessage(message);
    }
    await expect(page.locator(".item")).toHaveCount(messages.length);
  }

  // Motion (phase 1/2) is on by default, and Playwright's animation-disabling
  // only applies to `toHaveScreenshot` -- `captureStyleFingerprint` (reads
  // computed styles) and `expectNoHorizontalOverflow` (reads `scrollWidth`)
  // have no such guard, so either can run while an enter or FLIP-move
  // transition is still interpolating `transform`/`translate`/`opacity` and
  // capture a mid-animation value that differs run to run. Wait for the
  // observable "no transition classes present" state rather than a fixed
  // `waitForTimeout`, which would either flake under load or pad every test
  // with dead time. This resolves immediately when `isDisableAnimation=true`
  // (the composable renders a plain `<div>`, so these classes never appear)
  // and is therefore harmless to run unconditionally.
  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        ".chat-enter-active, .chat-leave-active, .chat-move",
      ).length === 0,
  );

  await page.evaluate(() => document.fonts.ready);

  if (messages.length > 0 && FONT_DEPENDENT_THEMES.has(theme)) {
    const fontLoaded = await page.evaluate(() =>
      document.fonts.check('16px "ONE-Mobile-POP"'),
    );
    if (!fontLoaded) {
      throw new Error(
        `openOverlay: theme=${theme} renders chat text with the ONE-Mobile-POP ` +
          "webfont, but document.fonts.check('16px \"ONE-Mobile-POP\"') came back " +
          "false after document.fonts.ready resolved and chat items rendered. " +
          "That font is served same-origin from /fonts/ONE-Mobile-POP.woff " +
          "(fetched into public/fonts/ by scripts/fetch-fonts.mjs at install time -- " +
          "see network.ts's file-level comment) -- a silent fallback to the system " +
          "font here would let a screenshot snapshot get baselined with the wrong " +
          "typeface. Check that public/fonts/ONE-Mobile-POP.woff exists (run `node " +
          "scripts/fetch-fonts.mjs` if not) and that the dev server is actually " +
          "serving it.",
      );
    }
  }

  return { irc, network };
}

/**
 * Minimal helper for the builder page (`/`) -- installs the same network
 * stub (the builder page's live preview can call the same external APIs as
 * the overlay) and navigates there. No IRC mock: the builder page itself
 * never opens a chat connection, only the `<ClientOnly><ChatOverlay/>`
 * embedded in the overlay route does.
 */
export async function openBuilderPage(
  page: Page,
  options: { network?: StubExternalNetworkOptions } = {},
): Promise<{ network: NetworkStubHandle }> {
  const network = await stubExternalNetwork(page, options.network);
  await page.goto("/");
  return { network };
}
