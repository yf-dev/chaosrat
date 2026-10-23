import { installH3Globals, createMockEvent } from "./h3TestHelpers";

const routes = [
  [
    "auth/callback",
    () => import("~/server/api/chzzk/auth/callback"),
    "GET",
    "?code=code&state=state",
    "oauth_state=state",
  ],
  [
    "auth/logout",
    () => import("~/server/api/chzzk/auth/logout"),
    "POST",
    "",
    "chzzk_access_token=at",
  ],
  [
    "auth/refresh",
    () => import("~/server/api/chzzk/auth/refresh"),
    "POST",
    "",
    "chzzk_refresh_token=rt",
  ],
  [
    "me",
    () => import("~/server/api/chzzk/me"),
    "GET",
    "",
    "chzzk_access_token=at",
  ],
  [
    "session/open",
    () => import("~/server/api/chzzk/session/open"),
    "POST",
    "",
    "chzzk_access_token=at",
  ],
  [
    "session/list",
    () => import("~/server/api/chzzk/session/list"),
    "GET",
    "",
    "chzzk_access_token=at",
  ],
  [
    "session/subscribeChat",
    () => import("~/server/api/chzzk/session/subscribeChat"),
    "POST",
    "",
    "chzzk_access_token=at",
  ],
  [
    "session/unsubscribeChat",
    () => import("~/server/api/chzzk/session/unsubscribeChat"),
    "POST",
    "",
    "chzzk_access_token=at",
  ],
  [
    "chatChannelId",
    () => import("~/server/api/chzzk/chatChannelId"),
    "GET",
    "?channelId=channel",
    "",
  ],
  [
    "twitch/badges",
    () => import("~/server/api/twitch/badges"),
    "GET",
    "?twitchChannelId=owner",
    "",
  ],
] as const;

describe("server upstream deadlines", () => {
  beforeEach(() => {
    vi.resetModules();
    installH3Globals();
  });

  it.each(routes)(
    "bounds the upstream call in %s",
    async (path, load, method, query, cookie) => {
      const upstream = vi
        .fn()
        .mockRejectedValue(new Error("upstream unavailable"));
      globalThis.$fetch = upstream as unknown as typeof globalThis.$fetch;
      const { default: handler } = await load();
      const { event } = createMockEvent({
        method,
        url: `/api/${path === "twitch/badges" ? "" : "chzzk/"}${path}${query}`,
        headers: cookie ? { cookie } : {},
        body: { sessionKey: "session-key" },
      });

      await handler(event);

      expect(upstream).toHaveBeenCalled();
      expect(upstream.mock.calls[0][1]).toEqual(
        expect.objectContaining({ timeout: 5000 }),
      );
    },
  );
});
