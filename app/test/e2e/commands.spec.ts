import { test, expect } from "@playwright/test";
import { openOverlay } from "./fixtures/overlay";

// Exercises broadcaster commands (composables/useCommand.ts). A command
// only fires for a message starting with "!!" sent by a user whose
// `tags.badges.broadcaster === "1"` -- installTwitchIrcMock's `broadcaster`
// shorthand on `sendMessage` sets exactly that badge. `!!set` works by
// `router.replace()`-ing a new query, which flows back through
// useChatOptionsStore's computeds -- an end-to-end round trip no unit test
// can exercise, since it needs a real vue-router instance reacting to a
// real navigation.

test.describe("commands: !!clear / !!클리어", () => {
  test("sent by the broadcaster empties the rendered list", async ({
    page,
  }) => {
    const { irc } = await openOverlay(page, {
      query: { theme: "default" },
      irc: { channel: "cmd_clear_channel" },
      messages: [
        { id: "e2e-cc-0001", displayName: "Viewer1", message: "hi" },
        { id: "e2e-cc-0002", displayName: "Viewer2", message: "hello" },
      ],
    });
    await expect(page.locator(".item")).toHaveCount(2);

    await irc.sendMessage({
      id: "e2e-cc-cmd-0001",
      displayName: "TheBroadcaster",
      message: "!!clear",
      broadcaster: true,
    });

    await expect(page.locator(".item")).toHaveCount(0);
  });

  test("the Korean alias !!클리어 also clears", async ({ page }) => {
    const { irc } = await openOverlay(page, {
      query: { theme: "default" },
      irc: { channel: "cmd_clear_kr_channel" },
      messages: [{ id: "e2e-cck-0001", displayName: "Viewer1", message: "hi" }],
    });
    await expect(page.locator(".item")).toHaveCount(1);

    await irc.sendMessage({
      id: "e2e-cck-cmd-0001",
      displayName: "TheBroadcaster",
      message: "!!클리어",
      broadcaster: true,
    });

    await expect(page.locator(".item")).toHaveCount(0);
  });

  test("sent by a non-broadcaster does nothing -- it renders as an ordinary chat message instead", async ({
    page,
  }) => {
    const { irc } = await openOverlay(page, {
      query: { theme: "default" },
      irc: { channel: "cmd_clear_unauth_channel" },
      messages: [{ id: "e2e-ccu-0001", displayName: "Viewer1", message: "hi" }],
    });
    await expect(page.locator(".item")).toHaveCount(1);

    await irc.sendMessage({
      id: "e2e-ccu-cmd-0001",
      displayName: "NotTheBroadcaster",
      message: "!!clear",
      // no `broadcaster: true` -- tags.badges.broadcaster is absent, so
      // useCommand's onBroadcasterMessage gate in useTwitch.ts
      // (`tags.badges?.broadcaster === "1"`) never even calls
      // onBroadcasterMessage; the message falls through to the ordinary
      // chat path instead.
    });

    // The list grew instead of clearing: the original message plus the
    // literal "!!clear" text rendered as a normal chat item.
    await expect(page.locator(".item")).toHaveCount(2);
    await expect(page.getByText("NotTheBroadcaster")).toBeVisible();
    await expect(page.getByText("!!clear")).toBeVisible();
  });
});

test.describe("commands: !!set / !!설정", () => {
  test("!!set theme cute-left changes the rendered theme AND the page URL's query string", async ({
    page,
  }) => {
    const { irc } = await openOverlay(page, {
      query: { theme: "default", twitchChannel: "cmd_set_channel" },
      irc: { channel: "cmd_set_channel" },
      messages: [
        { id: "e2e-cs-0001", displayName: "Viewer1", message: "before" },
      ],
    });
    await expect(page.locator(".item")).toHaveCount(1);
    // Sanity check on the starting theme: assert cute-left's marker
    // (`.list.align-left`, set via CuteChatBaseList's `align="left"` prop
    // -- see components/themes/cute/CuteChatLeftList.vue and
    // CuteChatBaseList.vue's `:class="`align-${props.align}`"`) is not
    // present yet.
    await expect(page.locator(".list.align-left")).toHaveCount(0);

    await irc.sendMessage({
      id: "e2e-cs-cmd-0001",
      displayName: "TheBroadcaster",
      message: "!!set theme cute-left",
      broadcaster: true,
    });

    // The command message itself must not render as chat.
    await expect(page.getByText("!!set theme cute-left")).toHaveCount(0);

    // The URL's query string actually changed via router.replace().
    await expect(page).toHaveURL(/[?&]theme=cute-left(&|$)/);

    // And the theme that's now mounted is cute-left's own component --
    // proven by its `.item` still containing the original message (proves
    // the chat pipeline survived the swap) plus the cute-left-only marker,
    // which neither `default` nor any other theme renders.
    await expect(page.locator(".list.align-left")).toHaveCount(1);
    await expect(page.getByText("before")).toBeVisible();
  });

  test("the Korean alias !!설정 also sets", async ({ page }) => {
    const { irc } = await openOverlay(page, {
      query: { theme: "default", twitchChannel: "cmd_set_kr_channel" },
      irc: { channel: "cmd_set_kr_channel" },
    });

    await irc.sendMessage({
      id: "e2e-csk-cmd-0001",
      displayName: "TheBroadcaster",
      message: "!!설정 theme simple",
      broadcaster: true,
    });

    await expect(page).toHaveURL(/[?&]theme=simple(&|$)/);
  });

  test("!!set with the wrong argument count is ignored without breaking anything", async ({
    page,
  }) => {
    const { irc } = await openOverlay(page, {
      query: { theme: "default", twitchChannel: "cmd_set_badargs_channel" },
      irc: { channel: "cmd_set_badargs_channel" },
      messages: [
        { id: "e2e-csb-0001", displayName: "Viewer1", message: "still here" },
      ],
    });
    await expect(page.locator(".item")).toHaveCount(1);
    const urlBefore = page.url();

    // Only one argument -- executeSet expects exactly 2 (variable, value).
    await irc.sendMessage({
      id: "e2e-csb-cmd-0001",
      displayName: "TheBroadcaster",
      message: "!!set theme",
      broadcaster: true,
    });

    // Command is still consumed (not rendered as chat)...
    await expect(page.getByText("!!set theme", { exact: true })).toHaveCount(0);
    // ...but nothing changed: same URL, same chat list, and the overlay
    // kept working afterwards (proven by the next assertion below).
    expect(page.url()).toBe(urlBefore);
    await expect(page.locator(".item")).toHaveCount(1);

    // A normal message sent right after still renders -- the overlay
    // wasn't left in a broken state by the malformed command.
    await irc.sendMessage({
      id: "e2e-csb-0002",
      displayName: "Viewer2",
      message: "after the bad command",
    });
    await expect(page.locator(".item")).toHaveCount(2);
    await expect(page.getByText("after the bad command")).toBeVisible();
  });
});

test.describe("commands: a command message is consumed, not rendered as chat", () => {
  test("a valid command from the broadcaster never appears as a chat item", async ({
    page,
  }) => {
    const { irc } = await openOverlay(page, {
      query: { theme: "default" },
      irc: { channel: "cmd_consumed_channel" },
    });

    await irc.sendMessage({
      id: "e2e-cons-cmd-0001",
      displayName: "TheBroadcaster",
      message: "!!clear",
      broadcaster: true,
    });

    // onBroadcasterMessage returning true makes useTwitch return early
    // before pushing to `messages` -- so no .item is ever created for it,
    // not even transiently. There genuinely are zero items in this test
    // (nothing was sent before the command), so this also doubles as
    // confirmation that !!clear didn't error out on an already-empty list.
    await expect(page.locator(".item")).toHaveCount(0);
    await expect(page.getByText("TheBroadcaster")).toHaveCount(0);
  });
});
