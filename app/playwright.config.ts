import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

// This file lives at the app root (`app/playwright.config.ts`), so resolve
// the app directory explicitly for `webServer.cwd` rather than relying on
// whatever `process.cwd()` happens to be when `playwright test` is invoked.
const appRoot = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  testDir: "./test/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],

  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.001,
    },
  },

  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    // A single run of builder.spec.ts failed once (the
    // hiddenUsernameRegex/hiddenMessageRegex round-trip test) and has never
    // reproduced; the cause remains unknown. `screenshot: "only-on-failure"`
    // is here so the next occurrence, if it happens, leaves something
    // behind. Screenshots are free on a green run — they are only taken when
    // a test fails.
    //
    // Tracing was tried and deliberately removed: `retain-on-failure`
    // records every test and discards the passing ones, measuring ~7 seconds
    // (~35%) slower across the suite. That cost is too high for a hook that
    // runs on every commit. Slower test runs also make timing-sensitive tests
    // *more* flaky, not less. If a trace is genuinely needed, run
    // `npx playwright test --trace on` for that investigation rather than
    // paying for it on every commit.
    //
    // `retries` stays at 0 on purpose: a retry would let a flake through the
    // commit gate, which is a policy call for the repo owner rather than
    // something to change while chasing diagnostics.
    //
    // Lesson: the original failure's error text was printed to stdout by the
    // reporter at the time, but was lost because output was piped through
    // `tail -3`. When a run fails, do not filter the output — the full error
    // text is what matters next.
    screenshot: "only-on-failure",
    // `reducedMotion` is not one of the direct `PlaywrightTestOptions`
    // fields in @playwright/test@1.61.0's types (unlike colorScheme/locale/
    // timezoneId) -- it must go through the `contextOptions` passthrough to
    // browser.newContext(). Every theme now ships a real
    // `prefers-reduced-motion: reduce` block (chat list enter/leave/move
    // transitions -- see useChatListMotion.ts and each theme's DESIGN.md
    // Motion section), and this setting is what makes the *entire* e2e
    // suite -- functional specs and visual snapshots alike -- render through
    // that reduced-motion branch (transition durations collapse to 1ms,
    // translate offsets collapse to `none`). That is what keeps
    // `toHaveScreenshot`/`captureStyleFingerprint` deterministic. The
    // consequence: the default full-motion path (the one every real viewer
    // gets, since `isDisableAnimation` defaults to off) is only exercised by
    // tests that explicitly opt out per-block via
    // `test.use({ contextOptions: { reducedMotion: "no-preference" } })` --
    // see "chat list motion" in overlay.spec.ts. A plain
    // `test.use({ reducedMotion: ... })` does NOT override this, precisely
    // because the setting lives under `contextOptions` rather than being a
    // direct option.
    contextOptions: {
      reducedMotion: "reduce",
    },
  },

  projects: [
    {
      name: "chromium",
      use: {
        // `devices["Desktop Chrome"]` already contributes viewport
        // 1280x720 and deviceScaleFactor 1 for this Playwright version, and
        // colorScheme/locale/timezoneId/contextOptions.reducedMotion are
        // inherited from the top-level `use` above -- not repeated here.
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            // Reduce cross-machine rasterization/font-hinting variance for
            // the screenshot tests a later agent will add.
            "--font-render-hinting=none",
            "--disable-lcd-text",
            "--force-color-profile=srgb",
            "--disable-gpu",
          ],
        },
      },
    },
  ],

  // @playwright/test is pinned to an EXACT version (1.61.0, no caret — see
  // package.json) on purpose: it must resolve to chromium revision 1228,
  // which is the revision already baked into the devcontainer image at
  // ~/.cache/ms-playwright/chromium-1228 (Chrome for Testing 149.0.7827.55).
  // playwright-core 1.60.0 -> chromium 1223, 1.61.0 -> 1228, 1.62.0 -> 1234
  // (checked against each version's published browsers.json). Bumping this
  // version without also rebuilding the devcontainer image makes
  // `playwright test` try to download a browser that isn't there and isn't
  // reachable in this sandboxed environment. Do not "helpfully" widen this
  // to a caret range or bump it in isolation.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    cwd: appRoot,
  },
});
