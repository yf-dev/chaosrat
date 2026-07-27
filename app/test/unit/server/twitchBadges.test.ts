import { installH3Globals, createMockEvent } from "./h3TestHelpers";

installH3Globals();

// badges.ts is mostly a forwarding/aggregation route (token -> global badges
// -> broadcaster lookup -> channel badges), so per the task scope we cover
// its parameter validation, the set_id/version_id merge logic (its one bit
// of real logic), the broadcaster-not-found short-circuit, and its
// catch-all error mapping — not every possible upstream response shape.
describe("server/api/twitch/badges", () => {
  it("returns an error when twitchChannelId is missing", async () => {
    const fetchMock = vi.fn();
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/twitch/badges")).default;
    const { event } = createMockEvent({ url: "/api/twitch/badges" });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      error: "channelId param should be a string",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("merges global and channel badges into a single set_id/version_id map", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("id.twitch.tv/oauth2/token")) {
        return Promise.resolve({
          access_token: "fake-app-token",
          expires_in: 3600,
          token_type: "bearer",
        });
      }
      if (url === "https://api.twitch.tv/helix/chat/badges/global") {
        return Promise.resolve({
          data: [
            {
              set_id: "subscriber",
              versions: [{ id: "0", image_url_4x: "https://img/global-0" }],
            },
          ],
        });
      }
      if (url.startsWith("https://api.twitch.tv/helix/users?login=")) {
        return Promise.resolve({ data: [{ id: "broadcaster-1" }] });
      }
      if (
        url ===
        "https://api.twitch.tv/helix/chat/badges?broadcaster_id=broadcaster-1"
      ) {
        return Promise.resolve({
          data: [
            {
              set_id: "founder",
              versions: [{ id: "1", image_url_4x: "https://img/founder-1" }],
            },
          ],
        });
      }
      throw new Error(`unexpected $fetch url: ${url}`);
    });
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/twitch/badges")).default;
    const { event } = createMockEvent({
      url: "/api/twitch/badges?twitchChannelId=somechannel",
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "OK",
      badge: {
        "subscriber/0": "https://img/global-0",
        "founder/1": "https://img/founder-1",
      },
    });
  });

  it("skips the channel-badges lookup when no broadcaster is found for the given login", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("id.twitch.tv/oauth2/token")) {
        return Promise.resolve({
          access_token: "fake-app-token",
          expires_in: 3600,
          token_type: "bearer",
        });
      }
      if (url === "https://api.twitch.tv/helix/chat/badges/global") {
        return Promise.resolve({
          data: [
            {
              set_id: "subscriber",
              versions: [{ id: "0", image_url_4x: "https://img/global-0" }],
            },
          ],
        });
      }
      if (url.startsWith("https://api.twitch.tv/helix/users?login=")) {
        return Promise.resolve({ data: [] });
      }
      throw new Error(`unexpected $fetch url: ${url}`);
    });
    globalThis.$fetch = fetchMock as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/twitch/badges")).default;
    const { event } = createMockEvent({
      url: "/api/twitch/badges?twitchChannelId=nobodyhome",
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "OK",
      badge: { "subscriber/0": "https://img/global-0" },
    });
    // token + global badges + broadcaster lookup only — no channel-badges call.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns an internal_server_error when an upstream call throws", async () => {
    globalThis.$fetch = vi
      .fn()
      .mockRejectedValue(
        new Error("network down"),
      ) as unknown as typeof globalThis.$fetch;

    const handler = (await import("~/server/api/twitch/badges")).default;
    const { event } = createMockEvent({
      url: "/api/twitch/badges?twitchChannelId=somechannel",
    });

    const result = await handler(event);

    expect(result).toEqual({
      status: "ERROR",
      error: "Internal Server Error",
    });
  });
});
