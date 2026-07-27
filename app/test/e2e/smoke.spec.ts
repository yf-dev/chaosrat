import { test, expect } from "@playwright/test";
import { openOverlay, openBuilderPage } from "./fixtures/overlay";
import { BASIC_MESSAGES } from "./fixtures/chatFixtures";

// Proves the e2e infrastructure (playwright.config.ts + the fixtures under
// test/e2e/fixtures/) actually works end to end: a real Nuxt dev server, a
// mocked Twitch IRC connection, a hermetic network stub, and the overlay
// rendering real chat items from it. Later specs (functional + per-theme
// visual) build on these same fixtures rather than re-deriving this setup.

test.describe("smoke", () => {
  test("builder page loads with the expected title", async ({ page }) => {
    await openBuilderPage(page);
    await expect(page).toHaveTitle("ChaosRat - 채팅 오버레이 URL 생성");
  });

  test("overlay renders Twitch chat messages from the mocked IRC connection", async ({
    page,
  }) => {
    const channel = "smoke_test_channel";
    await openOverlay(page, {
      query: { twitchChannel: channel, theme: "default" },
      messages: BASIC_MESSAGES,
    });

    const items = page.locator(".item");
    await expect(items).toHaveCount(BASIC_MESSAGES.length);

    for (const message of BASIC_MESSAGES) {
      await expect(page.getByText(message.displayName)).toBeVisible();
      await expect(page.getByText(message.message)).toBeVisible();
    }
  });
});
