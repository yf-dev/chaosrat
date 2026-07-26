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
}

export interface ChzzkConnectionTimings {
  retryBaseDelay?: number;
  retryMaxDelay?: number;
  tokenRefreshInterval?: number;
  authRecheckInterval?: number;
}

export function createChzzkConnection(
  deps: ChzzkConnectionDeps,
  timings: ChzzkConnectionTimings = {}
) {
  const retryBaseDelay = timings.retryBaseDelay ?? 1_000;
  const retryMaxDelay = timings.retryMaxDelay ?? 30_000;
  const tokenRefreshInterval =
    timings.tokenRefreshInterval ?? 6 * 60 * 60 * 1000;
  const authRecheckInterval = timings.authRecheckInterval ?? 30_000;

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

  function closeSocket() {
    if (!socket) return;
    const current = socket;
    socket = undefined;
    try {
      current.close();
    } catch (error) {
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
    } catch (error) {
      return { status: "ERROR" };
    }
  }

  async function safeRefreshToken(): Promise<boolean> {
    try {
      return await deps.refreshToken();
    } catch (error) {
      return false;
    }
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
    } catch (error) {
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
      }
      return;
    }

    if (type === "CHAT") {
      deps.onEvent({ type: "CHAT", message: parsed as ChzzkChatSessionMessage });
      return;
    }

    deps.onEvent({
      type: "DONATION",
      message: parsed as ChzzkDonationSessionMessage,
    });
  }

  async function handleSubscribe(key: string) {
    const gen = generation;
    let success = false;
    try {
      success = await deps.subscribeChat(key);
    } catch (error) {
      success = false;
    }

    if (!running || gen !== generation) return;

    if (success) {
      failureCount = 0;
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

  function start() {
    if (running) return;
    running = true;
    failureCount = 0;
    armTokenRefreshTimer();
    void connectCycle();
  }

  async function stop() {
    if (!running) return;
    running = false;
    generation += 1;
    clearRetryTimer();
    clearTokenRefreshTimer();
    const keyToUnsubscribe = sessionKey;
    sessionKey = undefined;
    if (keyToUnsubscribe) {
      try {
        await deps.unsubscribeChat(keyToUnsubscribe);
      } catch (error) {
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
