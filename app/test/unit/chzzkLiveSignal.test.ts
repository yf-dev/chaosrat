import { toLiveSignal, toSubscriptionHealth } from "~/lib/chzzkSignals";
import type { ChzzkSessionInfo } from "~/lib/interfaces";

describe("toLiveSignal", () => {
  it("maps status OK + liveStatus OPEN + a chatChannelId to OPEN with that id", () => {
    expect(
      toLiveSignal({
        status: "OK",
        chatChannelId: "chat-1",
        liveStatus: "OPEN",
        openDate: "2026-07-27T00:00:00",
      }),
    ).toEqual({ status: "OPEN", chatChannelId: "chat-1" });
  });

  it("maps status OK + liveStatus OPEN + a null chatChannelId to OPEN with a null id", () => {
    expect(
      toLiveSignal({
        status: "OK",
        chatChannelId: null,
        liveStatus: "OPEN",
        openDate: "2026-07-27T00:00:00",
      }),
    ).toEqual({ status: "OPEN", chatChannelId: null });
  });

  it("maps status OK + liveStatus CLOSE to CLOSED", () => {
    expect(
      toLiveSignal({
        status: "OK",
        chatChannelId: null,
        liveStatus: "CLOSE",
        openDate: null,
      }),
    ).toEqual({ status: "CLOSED" });
  });

  it("maps status OK + a null liveStatus (unofficial API changed shape) to CLOSED, not UNKNOWN", () => {
    expect(
      toLiveSignal({
        status: "OK",
        chatChannelId: null,
        liveStatus: null,
        openDate: null,
      }),
    ).toEqual({ status: "CLOSED" });
  });

  it("maps an ERROR envelope to UNKNOWN", () => {
    expect(
      toLiveSignal({
        status: "ERROR",
        code: "internal_server_error",
        error: "boom",
      }),
    ).toEqual({ status: "UNKNOWN" });
  });
});

describe("toSubscriptionHealth", () => {
  const baseSession: ChzzkSessionInfo = {
    sessionKey: "session-1",
    connectedDate: "2026-07-27T00:00:00",
    disconnectedDate: null,
    subscribedEvents: [{ eventType: "CHAT", channelId: "channel-1" }],
  };

  it("returns UNKNOWN, not LOST, when the sessionKey is absent from the list", () => {
    // The session list is paginated and keeps disconnected sessions
    // queryable for 90 days, so absence from the fetched page proves
    // nothing about health. Must not be LOST -- that would cause a
    // reconnect loop driven purely by pagination.
    expect(
      toSubscriptionHealth([baseSession], "some-other-session", "channel-1"),
    ).toBe("UNKNOWN");
  });

  it("returns UNKNOWN when the session list is empty", () => {
    expect(toSubscriptionHealth([], "session-1", "channel-1")).toBe("UNKNOWN");
  });

  it("returns LOST when the matching session has a non-empty disconnectedDate", () => {
    expect(
      toSubscriptionHealth(
        [{ ...baseSession, disconnectedDate: "2026-07-27T01:00:00" }],
        "session-1",
        "channel-1",
      ),
    ).toBe("LOST");
  });

  it("returns LOST when connected but subscribedEvents has no CHAT entry for our channelId", () => {
    expect(
      toSubscriptionHealth(
        [
          {
            ...baseSession,
            subscribedEvents: [
              { eventType: "DONATION", channelId: "channel-1" },
            ],
          },
        ],
        "session-1",
        "channel-1",
      ),
    ).toBe("LOST");
  });

  it("returns LOST when the CHAT entry exists but for a different channelId", () => {
    expect(
      toSubscriptionHealth(
        [
          {
            ...baseSession,
            subscribedEvents: [
              { eventType: "CHAT", channelId: "some-other-channel" },
            ],
          },
        ],
        "session-1",
        "channel-1",
      ),
    ).toBe("LOST");
  });

  it("returns SUBSCRIBED when connected and subscribedEvents has a matching CHAT entry", () => {
    expect(toSubscriptionHealth([baseSession], "session-1", "channel-1")).toBe(
      "SUBSCRIBED",
    );
  });

  it("returns UNKNOWN, not LOST, when channelId is falsy (transiently unset)", () => {
    // channelId can transiently be undefined while `!!set chzzkChannelId ...`
    // rewrites the route query; every subscribedEvents comparison would fail
    // against undefined, so this must be UNKNOWN, not a reconnect-triggering
    // LOST.
    expect(toSubscriptionHealth([baseSession], "session-1", undefined)).toBe(
      "UNKNOWN",
    );
  });

  it("returns SUBSCRIBED when other unrelated sessions are also present in the list", () => {
    const otherSession: ChzzkSessionInfo = {
      sessionKey: "session-2",
      connectedDate: "2026-07-27T00:00:00",
      disconnectedDate: "2026-07-26T00:00:00",
      subscribedEvents: [],
    };
    expect(
      toSubscriptionHealth(
        [otherSession, baseSession],
        "session-1",
        "channel-1",
      ),
    ).toBe("SUBSCRIBED");
  });
});
