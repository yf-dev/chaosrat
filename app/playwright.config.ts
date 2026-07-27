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
    // `reducedMotion` is not one of the direct `PlaywrightTestOptions`
    // fields in @playwright/test@1.61.0's types (unlike colorScheme/locale/
    // timezoneId) -- it must go through the `contextOptions` passthrough to
    // browser.newContext(). The app itself has no CSS animations or
    // transitions in any theme (verified by grep); this is belt-and-braces
    // for third-party CSS (chota) and for the screenshot tests a later
    // agent will add.
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
