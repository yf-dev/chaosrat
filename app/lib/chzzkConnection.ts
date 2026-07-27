// Framework-free CHZZK session/socket lifecycle for the leader tab.
//
// This module owns exactly one CHZZK socket.io session at a time. It never
// reuses a session URL across reconnects (CHZZK session URLs are short-lived),
// it never lets more than one socket be alive, and it never retries forever
// without backoff. See https://chzzk.gitbook.io/chzzk/chzzk-api/session for the
// wire spec this implements.

export interface ChzzkSystemConnectedSessionMessage {
  type: "connected";
  data: {
    sessionKey: string;
  };
}

export interface ChzzkSystemSubscribedSessionMessage {
  type: "subscribed";
  data: {
    eventType: "CHAT" | "DONATION";
    channelId: string;
  };
}

export interface ChzzkSystemUnsubscribedSessionMessage {
  type: "unsubscribed";
  data: {
    eventType: "CHAT" | "DONATION";
    channelId: string;
  };
}

export interface ChzzkSystemRevokedSessionMessage {
  type: "revoked";
  data: {
    eventType: "CHAT" | "DONATION";
    channelId: string;
  };
}

export type ChzzkSystemSessionMessage =
  | ChzzkSystemConnectedSessionMessage
  | ChzzkSystemSubscribedSessionMessage
  | ChzzkSystemUnsubscribedSessionMessage
  | ChzzkSystemRevokedSessionMessage;

export interface ChzzkChatSessionMessage {
  channelId: string;
  senderChannelId: string;
  profile: {
    nickname: string;
    badges: {
      imageUrl: string;
      [key: string]: string;
    }[];
    verifiedMark: boolean;
  };
  content: string;
  emojis: {
    [key: string]: string;
  };
  messageTime: number;
}

export interface ChzzkDonationSessionMessage {
  donationType: "CHAT" | "VIDEO";
  channelId: string;
  donatorChannelId: string;
  donatorNickname: string;
  payAmount: number;
  donationText: string;
  emojis: {
    [key: string]: string;
  };
}

export type ChzzkSessionMessageData =
  | {
      type: "SYSTEM";
      message: ChzzkSystemSessionMessage;
    }
  | {
      type: "CHAT";
      message: ChzzkChatSessionMessage;
    }
  | {
      type: "DONATION";
      message: ChzzkDonationSessionMessage;
    };

export type SessionUrlResult =
  | { status: "OK"; url: string }
  | { status: "UNAUTHORIZED" }
  | { status: "ERROR"; code?: string };

// Watchdog signals. Both are diagnostic/best-effort: when a dep is absent, or
// when it reports it cannot tell, the watchdog must never guess its way into
// a reconnect.
export type ChzzkLiveSignal =
  | { status: "OPEN"; chatChannelId: string | null }
  | { status: "CLOSED" }
  | { status: "UNKNOWN" };

export type ChzzkSubscriptionHealth = "SUBSCRIBED" | "LOST" | "UNKNOWN";

export interface ChzzkSocketHandlers {
  onConnect(): void;
  onDisconnect(): void;
  onError(error: unknown): void;
  onMessage(type: "SYSTEM" | "CHAT" | "DONATION", raw: string): void;
}

export interface ChzzkSocket {
  close(): void;
}

export interface ChzzkConnectionDeps {
  fetchSessionUrl(): Promise<SessionUrlResult>;
  refreshToken(): Promise<boolean>;
  createSocket(url: string, handlers: ChzzkSocketHandlers): ChzzkSocket;
  subscribeChat(sessionKey: string): Promise<boolean>;
  unsubscribeChat(sessionKey: string): Promise<boolean>;
  onEvent(data: ChzzkSessionMessageData): void;
  onAuthRequired(required: boolean): void;
  // Watchdog deps. Both optional: when omitted, the watchdog still arms on
  // its timer but has nothing to check and never reconnects on its own.
  fetchLiveSignal?(): Promise<ChzzkLiveSignal>;
  fetchSubscriptionHealth?(
    sessionKey: string,
  ): Promise<ChzzkSubscriptionHealth>;
}

export interface ChzzkConnectionTimings {
  retryBaseDelay?: number;
  retryMaxDelay?: number;
  tokenRefreshInterval?: number;
  authRecheckInterval?: number;
  watchdogInterval?: number;
}

export function createChzzkConnection(
  deps: ChzzkConnectionDeps,
  timings: ChzzkConnectionTimings = {},
) {
  const retryBaseDelay = timings.retryBaseDelay ?? 1_000;
  const retryMaxDelay = timings.retryMaxDelay ?? 30_000;
  const tokenRefreshInterval =
    timings.tokenRefreshInterval ?? 6 * 60 * 60 * 1000;
  const authRecheckInterval = timings.authRecheckInterval ?? 30_000;
  const watchdogInterval = timings.watchdogInterval ?? 60_000;

  let running = false;
  // Bumped every time a new connect attempt starts. Sockets/handlers close
  // over the generation they were created with, so a callback from a socket
  // that is no longer the current one is always ignored.
  let generation = 0;
  let socket: ChzzkSocket | undefined;
  let sessionKey: string | undefined;
  let failureCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let tokenRefreshTimer: ReturnType<typeof setInterval> | undefined;
  let watchdogTimer: ReturnType<typeof setInterval> | undefined;
  // Guards against a slow watchdog tick (still awaiting a dep call)
  // overlapping with the next timer fire.
  let watchdogTickRunning = false;
  // The chat-channel-id baseline: what fetchLiveSignal() reported at the
  // moment our current subscription was established (captured once by
  // captureLiveSignalBaseline() right after subscribeChat() succeeds), kept
  // up to date by the watchdog afterwards. CHZZK mints a new chatChannelId
  // per broadcast, so anything that differs from this recorded value means a
  // broadcast started (or changed) under a subscription that predates it --
  // this is deliberately the state *at subscribe time*, not at the first
  // watchdog tick: the dominant real-world case is starting OBS while the
  // channel is offline and only later going live, and baselining at the
  // first tick (which may fire well after that transition) would silently
  // miss it.
  //   - `undefined`: not baselined yet (the subscribe-time fetchLiveSignal()
  //     call hasn't resolved, wasn't provided, or returned UNKNOWN) --
  //     inert; the watchdog's own first observation baselines instead,
  //     degrading to "no reconnect on the very first signal" rather than
  //     guessing.
  //   - `null`: we were subscribed while the channel was offline (CLOSED, or
  //     OPEN with no chat channel) -- any later real id is a new broadcast.
  //   - a string: we were subscribed during that specific broadcast.
  // Reset to `undefined` on stop() so a restarted connection re-baselines
  // instead of comparing against a stale stream.
  let lastChatChannelId: string | null | undefined;

  function closeSocket() {
    if (!socket) return;
    const current = socket;
    socket = undefined;
    try {
      current.close();
    } catch {
      // Closing an already-dead socket must never crash the retry loop.
    }
  }

  function clearRetryTimer() {
    if (retryTimer === undefined) return;
    clearTimeout(retryTimer);
    retryTimer = undefined;
  }

  function scheduleRetry(delay: number) {
    clearRetryTimer();
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void connectCycle();
    }, delay);
  }

  function backoffDelay(): number {
    const delay = Math.min(retryBaseDelay * 2 ** failureCount, retryMaxDelay);
    failureCount += 1;
    return delay;
  }

  async function safeFetchSessionUrl(): Promise<SessionUrlResult> {
    try {
      return await deps.fetchSessionUrl();
    } catch {
      return { status: "ERROR" };
    }
  }

  async function safeRefreshToken(): Promise<boolean> {
    try {
      return await deps.refreshToken();
    } catch {
      return false;
    }
  }

  async function safeFetchLiveSignal(): Promise<ChzzkLiveSignal> {
    try {
      return await deps.fetchLiveSignal!();
    } catch {
      return { status: "UNKNOWN" };
    }
  }

  async function safeFetchSubscriptionHealth(
    key: string,
  ): Promise<ChzzkSubscriptionHealth> {
    try {
      return await deps.fetchSubscriptionHealth!(key);
    } catch {
      return "UNKNOWN";
    }
  }

  // Fire-and-forget: captures what fetchLiveSignal() reports right after a
  // subscribe succeeds, so the watchdog's later comparisons are against the
  // state *at subscription time* rather than at its own first tick (see the
  // lastChatChannelId comment for why that distinction matters). Must never
  // delay or fail the subscribe success path it is called from, hence `void`
  // and no rejection can escape (safeFetchLiveSignal() already swallows
  // throws). `gen` is the generation captured by the caller at the moment
  // the subscribe started, so a stale resolution (after stop(), or after the
  // connection has moved on to a newer generation) is discarded instead of
  // overwriting the current baseline.
  function captureLiveSignalBaseline(gen: number) {
    if (!deps.fetchLiveSignal) return;
    void (async () => {
      const signal = await safeFetchLiveSignal();
      if (!running || gen !== generation) return;

      if (signal.status === "OPEN") {
        lastChatChannelId = signal.chatChannelId;
      } else if (signal.status === "CLOSED") {
        lastChatChannelId = null;
      }
      // UNKNOWN: leave the recorded value untouched -- stay unbaselined (or
      // keep whatever baseline already existed) rather than guess.
    })();
  }

  // Used by the `unsubscribed`/watchdog triggers: a deliberate reconnect is
  // not a socket failure, so it must not consume the exponential backoff
  // schedule (failureCount resets to 0) and must happen immediately rather
  // than being scheduled.
  function forceReconnect() {
    if (!running) return;
    // Bump generation before closing, exactly like handleSocketFailure() and
    // the `revoked` branch: closeSocket() can synchronously re-enter this
    // same socket's onDisconnect handler, and without this bump that
    // reentrant callback would see its own (stale) generation still current
    // and misinterpret a deliberate reconnect as a second real failure.
    generation += 1;
    closeSocket();
    sessionKey = undefined;
    clearRetryTimer();
    failureCount = 0;
    void connectCycle();
  }

  async function connectCycle() {
    if (!running) return;
    const gen = ++generation;
    // Never let two sockets be alive: tear down whatever the previous
    // attempt left behind before fetching a (necessarily new) session URL.
    closeSocket();
    sessionKey = undefined;

    let result = await safeFetchSessionUrl();
    if (!running || gen !== generation) return;

    const wasUnauthorized = result.status === "UNAUTHORIZED";

    if (result.status === "UNAUTHORIZED") {
      const refreshed = await safeRefreshToken();
      if (!running || gen !== generation) return;

      if (refreshed) {
        result = await safeFetchSessionUrl();
        if (!running || gen !== generation) return;
      }
    }

    if (result.status === "OK") {
      deps.onAuthRequired(false);
      openSocket(result.url, gen);
      return;
    }

    if (wasUnauthorized) {
      // Refresh failed, or refresh succeeded but the URL fetch still isn't
      // OK: this is an auth problem, not a transient one. Re-check on the
      // slower auth cadence instead of hammering the session quota.
      deps.onAuthRequired(true);
      scheduleRetry(authRecheckInterval);
      return;
    }

    scheduleRetry(backoffDelay());
  }

  function openSocket(url: string, gen: number) {
    const handlers: ChzzkSocketHandlers = {
      onConnect: () => {
        // Nothing to do: success bookkeeping already happened in connectCycle.
      },
      onDisconnect: () => {
        if (!running || gen !== generation) return;
        handleSocketFailure();
      },
      onError: () => {
        if (!running || gen !== generation) return;
        handleSocketFailure();
      },
      onMessage: (type, raw) => {
        if (!running || gen !== generation) return;
        handleMessage(type, raw);
      },
    };
    socket = deps.createSocket(url, handlers);
  }

  function handleSocketFailure() {
    // Bump generation before closing: socket.io-client@2's close() fires
    // this same socket's onDisconnect handler synchronously (re-entrantly),
    // and without this bump that reentrant callback would see the same
    // generation, treat itself as a second real failure, and double-consume
    // the backoff schedule.
    generation += 1;
    closeSocket();
    sessionKey = undefined;
    scheduleRetry(backoffDelay());
  }

  function handleMessage(type: "SYSTEM" | "CHAT" | "DONATION", raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Malformed payload: drop it, never throw out of a socket callback.
      return;
    }

    if (type === "SYSTEM") {
      const message = parsed as ChzzkSystemSessionMessage;
      deps.onEvent({ type: "SYSTEM", message });
      if (message.type === "connected") {
        sessionKey = message.data.sessionKey;
        void handleSubscribe(message.data.sessionKey);
      } else if (message.type === "revoked") {
        // Consent was withdrawn: re-subscribing cannot work, so stop the
        // socket backoff loop and fall back to the auth recheck cadence.
        // Bump generation first for the same reason as handleSocketFailure():
        // closeSocket() can synchronously re-enter this socket's own
        // onDisconnect handler, which must not be allowed to schedule its
        // own (wrong) socket-backoff retry.
        generation += 1;
        closeSocket();
        sessionKey = undefined;
        deps.onAuthRequired(true);
        scheduleRetry(authRecheckInterval);
      } else if (
        message.type === "unsubscribed" &&
        message.data.eventType === "CHAT"
      ) {
        // CHZZK cancelled our CHAT subscription server-side while the socket
        // itself stays healthy -- e.g. the broadcaster ended the stream. A
        // healthy socket with a dead subscription looks identical to quiet
        // chat from the outside, so this is the only signal we get; treat it
        // as subscription loss and force a fresh session + subscribe right
        // away, without waiting on (or consuming) the backoff schedule.
        // DONATION unsubscribes are not chat-affecting and are ignored here.
        forceReconnect();
      }
      return;
    }

    if (type === "CHAT") {
      deps.onEvent({
        type: "CHAT",
        message: parsed as ChzzkChatSessionMessage,
      });
      return;
    }

    deps.onEvent({
      type: "DONATION",
      message: parsed as ChzzkDonationSessionMessage,
    });
  }

  async function handleSubscribe(key: string) {
    const gen = generation;
    let success: boolean;
    try {
      success = await deps.subscribeChat(key);
    } catch {
      success = false;
    }

    if (!running || gen !== generation) return;

    if (success) {
      failureCount = 0;
      captureLiveSignalBaseline(gen);
      return;
    }

    handleSocketFailure();
  }

  function armTokenRefreshTimer() {
    clearTokenRefreshTimer();
    tokenRefreshTimer = setInterval(() => {
      void runTokenRefresh();
    }, tokenRefreshInterval);
  }

  function clearTokenRefreshTimer() {
    if (tokenRefreshTimer === undefined) return;
    clearInterval(tokenRefreshTimer);
    tokenRefreshTimer = undefined;
  }

  async function runTokenRefresh() {
    if (!running) return;
    // Just a token keep-alive: never touch the (possibly healthy) socket.
    await safeRefreshToken();
  }

  function armWatchdogTimer() {
    clearWatchdogTimer();
    watchdogTimer = setInterval(() => {
      void runWatchdogTick();
    }, watchdogInterval);
  }

  function clearWatchdogTimer() {
    if (watchdogTimer === undefined) return;
    clearInterval(watchdogTimer);
    watchdogTimer = undefined;
  }

  async function runWatchdogTick() {
    // Never let two ticks overlap: a tick whose dep call is still pending
    // must finish (or bail on a stopped/superseded connection) before the
    // next timer fire is allowed to start another one.
    if (!running || watchdogTickRunning) return;
    watchdogTickRunning = true;
    try {
      const gen = generation;
      let reconnectedThisTick = false;

      if (deps.fetchLiveSignal) {
        const signal = await safeFetchLiveSignal();
        if (!running || gen !== generation) return;

        if (signal.status === "OPEN" && signal.chatChannelId !== null) {
          if (lastChatChannelId === undefined) {
            // No baseline yet (the subscribe-time capture hasn't resolved,
            // returned UNKNOWN, or fetchLiveSignal wasn't provided then): we
            // genuinely cannot tell whether this broadcast predates our
            // subscription, so just record it and let a *later* change
            // trigger the reconnect instead of guessing now.
            lastChatChannelId = signal.chatChannelId;
          } else if (signal.chatChannelId !== lastChatChannelId) {
            // Either the baseline was `null` (we subscribed while offline
            // and a broadcast has since started) or a different real id
            // (CHZZK mints a new chatChannelId per broadcast, so this is a
            // *different* broadcast than the one we subscribed under).
            // Either way, a broadcast started/changed under a subscription
            // that predates it.
            lastChatChannelId = signal.chatChannelId;
            forceReconnect();
            reconnectedThisTick = true;
          }
        }
        // OPEN with a null chatChannelId, CLOSED, and UNKNOWN are all
        // deliberately inert here, and none of them overwrite the recorded
        // value: overwriting would erase a real (or "offline") baseline and
        // make the next real OPEN look unbaselined, skipping the very
        // reconnect this is meant to catch.
      }

      if (
        !reconnectedThisTick &&
        deps.fetchSubscriptionHealth &&
        sessionKey &&
        running &&
        gen === generation
      ) {
        const keyToCheck = sessionKey;
        const health = await safeFetchSubscriptionHealth(keyToCheck);
        if (running && gen === generation && health === "LOST") {
          forceReconnect();
        }
      }
    } finally {
      watchdogTickRunning = false;
    }
  }

  function start() {
    if (running) return;
    running = true;
    failureCount = 0;
    armTokenRefreshTimer();
    armWatchdogTimer();
    void connectCycle();
  }

  async function stop() {
    if (!running) return;
    running = false;
    generation += 1;
    clearRetryTimer();
    clearTokenRefreshTimer();
    clearWatchdogTimer();
    lastChatChannelId = undefined;
    const keyToUnsubscribe = sessionKey;
    sessionKey = undefined;
    if (keyToUnsubscribe) {
      try {
        await deps.unsubscribeChat(keyToUnsubscribe);
      } catch {
        // Best-effort: the socket is going away regardless.
      }
    }
    closeSocket();
  }

  function isRunning() {
    return running;
  }

  return { start, stop, isRunning };
}
