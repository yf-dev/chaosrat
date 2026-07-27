// Pure mappings from the two CHZZK diagnostic HTTP endpoints to the watchdog
// signals defined in lib/chzzkConnection.ts. Kept framework-free (no $fetch,
// no Vue refs, no Nuxt auto-imports) so they are unit-testable in the plain
// `node` vitest project -- see useChzzk.ts for the actual wiring ($fetch
// calls, chatOptions, console diagnostics) that calls these.

import type {
  ChatOptions,
  ChzzkChatChannelIdResponse,
  ChzzkSessionInfo,
  ApiError,
} from "~/lib/interfaces";
import type {
  ChzzkLiveSignal,
  ChzzkSubscriptionHealth,
} from "~/lib/chzzkConnection";

// Maps the /api/chzzk/chatChannelId envelope to a ChzzkLiveSignal.
//
// Naming trap worth calling out explicitly: the envelope's own discriminator
// is `status` ("OK" | "ERROR"), while the broadcast state lives in the
// unrelated `liveStatus` field ("OPEN" | "CLOSE" | null). Do not conflate
// `response.status` with `response.liveStatus`.
//
// The "no chzzkChannelId configured" case is handled by the caller before it
// ever fetches (same pattern as fetchSessionUrl in useChzzk.ts), so it is not
// a branch here.
export function toLiveSignal(
  response: ChzzkChatChannelIdResponse | ApiError,
): ChzzkLiveSignal {
  if (response.status === "ERROR") {
    return { status: "UNKNOWN" };
  }
  if (response.liveStatus === "OPEN") {
    return { status: "OPEN", chatChannelId: response.chatChannelId ?? null };
  }
  // Any non-"OPEN" liveStatus -- the documented "CLOSE", or null if the
  // unofficial upstream API ever changes shape -- is treated the same way:
  // the broadcast is not live, so there is no chat channel to compare
  // against.
  return { status: "CLOSED" };
}

// Maps the /api/chzzk/session/list envelope's `sessions` array to a
// ChzzkSubscriptionHealth for one specific sessionKey.
//
// This project's approved Chzzk Open API scopes do permit GET
// /open/v1/sessions -- verified against a live login (see the matching
// note in server/api/chzzk/session/list.ts). A call can still fail for other
// reasons, and when it does the caller maps the ERROR envelope to "UNKNOWN"
// before this function is ever reached, degrading the watchdog to the
// live-signal trigger alone. That is the intended degradation, not a bug to
// chase.
export function toSubscriptionHealth(
  sessions: ChzzkSessionInfo[],
  sessionKey: string,
  channelId: ChatOptions["chzzkChannelId"],
): ChzzkSubscriptionHealth {
  if (!channelId) {
    // channelId can transiently be unset: `useCommand`'s `!!set chzzkChannelId
    // ...` rewrites the route query at runtime, so this function can be
    // called for a session key that predates the new (missing) channelId.
    // Every subscribedEvents comparison below would fail against `undefined`,
    // which would otherwise report "LOST" and make the watchdog force a
    // reconnect for a connection whose channel id is simply not known yet --
    // not something we can actually judge, so report UNKNOWN instead.
    return "UNKNOWN";
  }

  const session = sessions.find((s) => s.sessionKey === sessionKey);
  if (!session) {
    // The Chzzk session list keeps disconnected sessions queryable for 90
    // days and is paginated (default page size 20). Our current session can
    // be legitimately absent from the page we fetched (page 0) for reasons
    // that have nothing to do with its health -- e.g. it simply isn't on
    // that page. Reporting "LOST" here would cause a reconnect loop driven
    // entirely by pagination, so this is deliberately "UNKNOWN", not "LOST".
    return "UNKNOWN";
  }

  if (session.disconnectedDate) {
    return "LOST";
  }

  const hasChatSubscription = session.subscribedEvents.some(
    (event) => event.eventType === "CHAT" && event.channelId === channelId,
  );
  if (!hasChatSubscription) {
    return "LOST";
  }

  return "SUBSCRIBED";
}
