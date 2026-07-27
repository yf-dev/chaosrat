import {
  createChzzkConnection,
  type ChzzkConnectionDeps,
  type ChzzkLiveSignal,
  type ChzzkSocket,
  type ChzzkSocketHandlers,
  type SessionUrlResult,
} from "~/lib/chzzkConnection";

interface SocketRecord {
  id: number;
  url: string;
  handlers: ChzzkSocketHandlers;
  close: ReturnType<typeof vi.fn>;
}

function createHarness() {
  const sockets: SocketRecord[] = [];
  let nextId = 0;

  const fetchSessionUrl = vi.fn(async (): Promise<SessionUrlResult> => ({
    status: "OK",
    url: "default",
  }));
  const refreshToken = vi.fn(async (): Promise<boolean> => true);
  const subscribeChat = vi.fn(async (_key: string): Promise<boolean> => true);
  const unsubscribeChat = vi.fn(async (_key: string): Promise<boolean> => true);
  const onEvent = vi.fn();
  const onAuthRequired = vi.fn();

  const createSocket = vi.fn(
    (url: string, handlers: ChzzkSocketHandlers): ChzzkSocket => {
      const close = vi.fn();
      sockets.push({ id: nextId++, url, handlers, close });
      return { close };
    },
  );

  const deps: ChzzkConnectionDeps = {
    fetchSessionUrl,
    refreshToken,
    createSocket,
    subscribeChat,
    unsubscribeChat,
    onEvent,
    onAuthRequired,
  };

  return {
    deps,
    sockets,
    fetchSessionUrl,
    refreshToken,
    subscribeChat,
    unsubscribeChat,
    onEvent,
    onAuthRequired,
    createSocket,
    latestSocket: () => sockets[sockets.length - 1],
  };
}

const timings = {
  retryBaseDelay: 1_000,
  retryMaxDelay: 30_000,
  tokenRefreshInterval: 60 * 60 * 1000,
  authRecheckInterval: 5_000,
};

function connectedMessage(sessionKey: string) {
  return JSON.stringify({ type: "connected", data: { sessionKey } });
}

function revokedMessage() {
  return JSON.stringify({
    type: "revoked",
    data: { eventType: "CHAT", channelId: "ch1" },
  });
}

function unsubscribedMessage(eventType: "CHAT" | "DONATION") {
  return JSON.stringify({
    type: "unsubscribed",
    data: { eventType, channelId: "ch1" },
  });
}

describe("createChzzkConnection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("1. start() fetches a session URL and opens a socket with exactly that URL", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "OK", url: "wss://a" });
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(1);
    expect(h.createSocket).toHaveBeenCalledTimes(1);
    expect(h.createSocket.mock.calls[0][0]).toBe("wss://a");
  });

  it("2. never reuses a URL after an unexpected disconnect", async () => {
    const h = createHarness();
    h.fetchSessionUrl
      .mockResolvedValueOnce({ status: "OK", url: "wss://first" })
      .mockResolvedValueOnce({ status: "OK", url: "wss://second" });
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.createSocket.mock.calls[0][0]).toBe("wss://first");

    // Unexpected disconnect from the leader socket.
    h.latestSocket().handlers.onDisconnect();
    await vi.advanceTimersByTimeAsync(timings.retryBaseDelay);

    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(2);
    expect(h.createSocket).toHaveBeenCalledTimes(2);
    expect(h.createSocket.mock.calls[1][0]).toBe("wss://second");
    expect(h.createSocket.mock.calls[1][0]).not.toBe("wss://first");

    await conn.stop();
  });

  it("3. onError tears down the socket and retries with a freshly fetched URL after backoff", async () => {
    const h = createHarness();
    h.fetchSessionUrl
      .mockResolvedValueOnce({ status: "OK", url: "wss://first" })
      .mockResolvedValueOnce({ status: "OK", url: "wss://second" });
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    const firstSocket = h.latestSocket();

    firstSocket.handlers.onError(new Error("connect_error"));

    // Before the backoff delay elapses, no retry has happened yet.
    await vi.advanceTimersByTimeAsync(timings.retryBaseDelay - 1);
    expect(h.createSocket).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(h.createSocket).toHaveBeenCalledTimes(2);
    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(2);
    expect(firstSocket.close).toHaveBeenCalled();

    await conn.stop();
  });

  it("4. stop() triggers no further fetchSessionUrl calls, ever", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "ERROR" });
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    const callsBeforeStop = h.fetchSessionUrl.mock.calls.length;
    expect(callsBeforeStop).toBeGreaterThan(0);

    await conn.stop();

    await vi.advanceTimersByTimeAsync(10 * 60 * 60 * 1000);
    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(callsBeforeStop);
  });

  it("5. UNAUTHORIZED triggers refreshToken(), then a fresh fetch connects on success", async () => {
    const h = createHarness();
    h.fetchSessionUrl
      .mockResolvedValueOnce({ status: "UNAUTHORIZED" })
      .mockResolvedValueOnce({ status: "OK", url: "wss://after-refresh" });
    h.refreshToken.mockResolvedValue(true);
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(h.refreshToken).toHaveBeenCalledTimes(1);
    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(2);
    expect(h.createSocket).toHaveBeenCalledTimes(1);
    expect(h.createSocket.mock.calls[0][0]).toBe("wss://after-refresh");

    await conn.stop();
  });

  it("6. refreshToken() failure emits onAuthRequired(true), keeps rechecking, then recovers without restart", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "UNAUTHORIZED" });
    h.refreshToken.mockResolvedValue(false);
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(h.onAuthRequired).toHaveBeenLastCalledWith(true);
    expect(h.createSocket).not.toHaveBeenCalled();
    const attemptsSoFar = h.fetchSessionUrl.mock.calls.length;

    // Still failing: keeps re-checking on the auth cadence.
    await vi.advanceTimersByTimeAsync(timings.authRecheckInterval);
    expect(h.fetchSessionUrl.mock.calls.length).toBeGreaterThan(attemptsSoFar);
    expect(h.createSocket).not.toHaveBeenCalled();

    // Auth recovers on the next recheck.
    h.fetchSessionUrl.mockResolvedValue({
      status: "OK",
      url: "wss://recovered",
    });
    await vi.advanceTimersByTimeAsync(timings.authRecheckInterval);

    expect(h.onAuthRequired).toHaveBeenLastCalledWith(false);
    expect(h.createSocket).toHaveBeenCalledTimes(1);
    expect(h.createSocket.mock.calls[0][0]).toBe("wss://recovered");

    await conn.stop();
  });

  it("7. repeated failures back off exponentially and cap at retryMaxDelay", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "ERROR" });
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(1);

    // Expected schedule with base=1000, max=30000: 1000, 2000, 4000, 8000,
    // 16000, 30000(capped), 30000(capped), ...
    // Advance exactly through the first five backoffs.
    await vi.advanceTimersByTimeAsync(1000); // -> attempt 2
    await vi.advanceTimersByTimeAsync(2000); // -> attempt 3
    await vi.advanceTimersByTimeAsync(4000); // -> attempt 4
    await vi.advanceTimersByTimeAsync(8000); // -> attempt 5
    await vi.advanceTimersByTimeAsync(16000); // -> attempt 6 (delay capped at 30000 from here on)
    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(6);

    // A long elapsed time afterwards should only add capped-interval attempts.
    await vi.advanceTimersByTimeAsync(30000 * 5);
    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(11);

    await conn.stop();
  });

  it("8. on SYSTEM connected, subscribeChat() is called with that socket's sessionKey", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "OK", url: "wss://a" });
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);

    h.latestSocket().handlers.onMessage("SYSTEM", connectedMessage("sess-123"));
    await vi.advanceTimersByTimeAsync(0);

    expect(h.subscribeChat).toHaveBeenCalledWith("sess-123");

    await conn.stop();
  });

  it("9. stop() calls unsubscribeChat() with the current session key, then closes the socket", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "OK", url: "wss://a" });
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    h.latestSocket().handlers.onMessage("SYSTEM", connectedMessage("sess-abc"));
    await vi.advanceTimersByTimeAsync(0);

    const socket = h.latestSocket();
    const callOrder: string[] = [];
    h.unsubscribeChat.mockImplementation(async (key: string) => {
      callOrder.push(`unsubscribe:${key}`);
      return true;
    });
    socket.close.mockImplementation(() => {
      callOrder.push("close");
    });

    await conn.stop();

    expect(h.unsubscribeChat).toHaveBeenCalledWith("sess-abc");
    expect(callOrder).toEqual(["unsubscribe:sess-abc", "close"]);
  });

  it("10. SYSTEM revoked stops the reconnect loop and emits onAuthRequired(true)", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "OK", url: "wss://a" });
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    h.latestSocket().handlers.onMessage("SYSTEM", revokedMessage());
    await vi.advanceTimersByTimeAsync(0);

    expect(h.onAuthRequired).toHaveBeenLastCalledWith(true);
    expect(h.latestSocket().close).toHaveBeenCalled();

    // It must not hammer using the fast socket-retry backoff.
    const callsRightAfter = h.fetchSessionUrl.mock.calls.length;
    await vi.advanceTimersByTimeAsync(timings.retryBaseDelay);
    expect(h.fetchSessionUrl.mock.calls.length).toBe(callsRightAfter);

    // It does retry on the slower auth-recheck cadence.
    await vi.advanceTimersByTimeAsync(timings.authRecheckInterval);
    expect(h.fetchSessionUrl.mock.calls.length).toBe(callsRightAfter + 1);

    await conn.stop();
  });

  it("11. only one socket is alive at a time: previous socket closed before the next is created", async () => {
    const h = createHarness();
    h.fetchSessionUrl
      .mockResolvedValueOnce({ status: "OK", url: "wss://first" })
      .mockResolvedValueOnce({ status: "OK", url: "wss://second" });
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    const firstSocket = h.latestSocket();

    let firstClosedBeforeSecondCreated = false;
    const originalImpl = h.createSocket.getMockImplementation()!;
    h.createSocket.mockImplementation(
      (url: string, handlers: ChzzkSocketHandlers) => {
        if (firstSocket.close.mock.calls.length > 0) {
          firstClosedBeforeSecondCreated = true;
        }
        return originalImpl(url, handlers);
      },
    );

    firstSocket.handlers.onDisconnect();
    await vi.advanceTimersByTimeAsync(timings.retryBaseDelay);

    expect(h.createSocket).toHaveBeenCalledTimes(2);
    expect(firstSocket.close).toHaveBeenCalled();
    expect(firstClosedBeforeSecondCreated).toBe(true);

    await conn.stop();
  });

  it("12. token-refresh timer fires at tokenRefreshInterval without tearing down a healthy socket", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "OK", url: "wss://a" });
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    const socket = h.latestSocket();

    await vi.advanceTimersByTimeAsync(timings.tokenRefreshInterval);

    expect(h.refreshToken).toHaveBeenCalledTimes(1);
    expect(socket.close).not.toHaveBeenCalled();
    expect(h.createSocket).toHaveBeenCalledTimes(1);

    await conn.stop();
  });

  it("13. late callbacks from a stale socket are ignored", async () => {
    const h = createHarness();
    h.fetchSessionUrl
      .mockResolvedValueOnce({ status: "OK", url: "wss://first" })
      .mockResolvedValueOnce({ status: "OK", url: "wss://second" });
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    const firstSocket = h.latestSocket();

    // Promote a new socket by disconnecting.
    firstSocket.handlers.onDisconnect();
    await vi.advanceTimersByTimeAsync(timings.retryBaseDelay);
    expect(h.createSocket).toHaveBeenCalledTimes(2);
    const callsAfterSecondSocket = h.fetchSessionUrl.mock.calls.length;

    // Stale callback arrives from the now-replaced first socket.
    firstSocket.handlers.onDisconnect();
    firstSocket.handlers.onError(new Error("late"));
    firstSocket.handlers.onMessage("SYSTEM", connectedMessage("stale-key"));
    await vi.advanceTimersByTimeAsync(timings.retryMaxDelay);

    expect(h.fetchSessionUrl.mock.calls.length).toBe(callsAfterSecondSocket);
    expect(h.subscribeChat).not.toHaveBeenCalledWith("stale-key");

    await conn.stop();

    // Stale callback arrives after stop() too.
    const socket2 = h.latestSocket();
    const callsAfterStop = h.fetchSessionUrl.mock.calls.length;
    socket2.handlers.onDisconnect();
    await vi.advanceTimersByTimeAsync(timings.retryMaxDelay);
    expect(h.fetchSessionUrl.mock.calls.length).toBe(callsAfterStop);
  });

  it("14. forwards SYSTEM/CHAT/DONATION messages to onEvent and swallows malformed JSON", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "OK", url: "wss://a" });
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    const socket = h.latestSocket();

    const chatMessage = {
      channelId: "ch1",
      senderChannelId: "sender1",
      profile: { nickname: "n", badges: [], verifiedMark: false },
      content: "hi",
      emojis: {},
      messageTime: 1,
    };
    const donationMessage = {
      donationType: "CHAT",
      channelId: "ch1",
      donatorChannelId: "d1",
      donatorNickname: "d",
      payAmount: 1000,
      donationText: "gg",
      emojis: {},
    };

    socket.handlers.onMessage("CHAT", JSON.stringify(chatMessage));
    socket.handlers.onMessage("DONATION", JSON.stringify(donationMessage));

    expect(h.onEvent).toHaveBeenCalledWith({
      type: "CHAT",
      message: chatMessage,
    });
    expect(h.onEvent).toHaveBeenCalledWith({
      type: "DONATION",
      message: donationMessage,
    });

    expect(() => {
      socket.handlers.onMessage("SYSTEM", "{not valid json");
    }).not.toThrow();
    expect(h.onEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "SYSTEM", message: undefined }),
    );

    await conn.stop();
  });

  it("15. repeated socket-establishment failures back off exponentially and cap, even though every fetchSessionUrl call succeeds", async () => {
    const h = createHarness();
    // The session URL fetch always succeeds, but the socket it opens always
    // fails to establish (e.g. connect_error). failureCount must accumulate
    // across cycles instead of being wiped out by the successful fetch.
    h.fetchSessionUrl.mockResolvedValue({
      status: "OK",
      url: "wss://always-ok",
    });
    h.createSocket.mockImplementation(
      (_url: string, handlers: ChzzkSocketHandlers) => {
        const close = vi.fn();
        handlers.onError(new Error("connect_error"));
        return { close };
      },
    );
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(1);

    // Same expected schedule as test 7: base=1000, max=30000 ->
    // 1000, 2000, 4000, 8000, 16000, 30000(capped), 30000(capped), ...
    await vi.advanceTimersByTimeAsync(1000); // -> attempt 2
    await vi.advanceTimersByTimeAsync(2000); // -> attempt 3
    await vi.advanceTimersByTimeAsync(4000); // -> attempt 4
    await vi.advanceTimersByTimeAsync(8000); // -> attempt 5
    await vi.advanceTimersByTimeAsync(16000); // -> attempt 6 (delay capped at 30000 from here on)
    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(6);

    // A long elapsed time afterwards should only add capped-interval attempts.
    await vi.advanceTimersByTimeAsync(30000 * 5);
    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(11);

    await conn.stop();
  });

  // socket.io-client@2's Socket.prototype.close() calls this.onclose(...)
  // synchronously, which synchronously fires our own onDisconnect handler
  // for that same socket. These tests give the fake socket that same
  // real-world shape (close() synchronously re-enters onDisconnect) instead
  // of the no-op close() the tests above use, so they exercise the
  // reentrancy path that a fully mocked close() never touches.

  it("16. a socket whose close() synchronously fires onDisconnect still backs off on the designed exponential schedule", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({
      status: "OK",
      url: "wss://always-ok",
    });
    h.createSocket.mockImplementation(
      (_url: string, handlers: ChzzkSocketHandlers) => {
        const close = vi.fn(() => {
          // Real socket.io v2 behaviour: close() synchronously re-enters
          // this socket's own onDisconnect handler.
          handlers.onDisconnect();
        });
        // The failure arrives after openSocket() has already assigned this
        // socket to the module's `socket` variable, same as a real
        // connect_error event would.
        Promise.resolve().then(() => {
          handlers.onError(new Error("connect_error"));
        });
        return { close };
      },
    );
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(1);

    // Same designed schedule as tests 7/15: 1000, 2000, 4000, 8000, 16000,
    // then capped at 30000. If handleSocketFailure()'s closeSocket() lets the
    // reentrant onDisconnect call handleSocketFailure() a second time (because
    // generation wasn't bumped first), failureCount advances twice per real
    // failure and this schedule is violated.
    await vi.advanceTimersByTimeAsync(1000); // -> attempt 2
    await vi.advanceTimersByTimeAsync(2000); // -> attempt 3
    await vi.advanceTimersByTimeAsync(4000); // -> attempt 4
    await vi.advanceTimersByTimeAsync(8000); // -> attempt 5
    await vi.advanceTimersByTimeAsync(16000); // -> attempt 6 (capped from here)
    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(6);

    // A long elapsed time afterwards should only add capped-interval attempts.
    await vi.advanceTimersByTimeAsync(30000 * 5);
    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(11);

    await conn.stop();
  });

  it("17. SYSTEM revoked on a synchronously-disconnecting socket still retries once, at authRecheckInterval and not the socket backoff delay", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "OK", url: "wss://a" });
    let latestHandlers: ChzzkSocketHandlers | undefined;
    h.createSocket.mockImplementation(
      (_url: string, handlers: ChzzkSocketHandlers) => {
        latestHandlers = handlers;
        const close = vi.fn(() => {
          handlers.onDisconnect();
        });
        return { close };
      },
    );
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    latestHandlers!.onMessage("SYSTEM", revokedMessage());
    await vi.advanceTimersByTimeAsync(0);

    expect(h.onAuthRequired).toHaveBeenLastCalledWith(true);
    const callsRightAfter = h.fetchSessionUrl.mock.calls.length;

    // Must not retry on the fast socket backoff delay...
    await vi.advanceTimersByTimeAsync(timings.retryBaseDelay);
    expect(h.fetchSessionUrl.mock.calls.length).toBe(callsRightAfter);

    // ...only once, on the slower auth-recheck cadence.
    await vi.advanceTimersByTimeAsync(
      timings.authRecheckInterval - timings.retryBaseDelay,
    );
    expect(h.fetchSessionUrl.mock.calls.length).toBe(callsRightAfter + 1);

    await conn.stop();
  });

  it("19. isRunning() reflects the running state across start()/stop()", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "OK", url: "wss://a" });
    const conn = createChzzkConnection(h.deps, timings);

    expect(conn.isRunning()).toBe(false);

    conn.start();
    expect(conn.isRunning()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(conn.isRunning()).toBe(true);

    await conn.stop();
    expect(conn.isRunning()).toBe(false);
  });

  it("20. a fetchSessionUrl() that throws (instead of rejecting cleanly) is treated as an ERROR result and backs off", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockImplementationOnce(() => {
      throw new Error("synchronous boom");
    });
    h.fetchSessionUrl.mockResolvedValueOnce({ status: "OK", url: "wss://a" });
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);

    // First cycle's fetchSessionUrl() throw is swallowed by
    // safeFetchSessionUrl(), producing an ERROR result -> scheduleRetry().
    expect(h.createSocket).not.toHaveBeenCalled();
    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(timings.retryBaseDelay);
    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(2);
    expect(h.createSocket).toHaveBeenCalledTimes(1);

    await conn.stop();
  });

  it("21. a refreshToken() that throws is treated as a failed refresh, keeping onAuthRequired(true)", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "UNAUTHORIZED" });
    h.refreshToken.mockImplementationOnce(() => {
      throw new Error("synchronous boom");
    });
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(h.onAuthRequired).toHaveBeenLastCalledWith(true);
    expect(h.createSocket).not.toHaveBeenCalled();

    await conn.stop();
  });

  it("22. a subscribeChat() that throws is treated as a failed subscribe, triggering the same backoff as an explicit false", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "OK", url: "wss://a" });
    h.subscribeChat.mockRejectedValueOnce(new Error("subscribe boom"));
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    const firstSocket = h.latestSocket();

    firstSocket.handlers.onMessage("SYSTEM", connectedMessage("sess-1"));
    // Let handleSubscribe()'s subscribeChat() rejection settle.
    await vi.advanceTimersByTimeAsync(0);

    // A failed subscribe (whether via throw or an explicit `false`) must
    // tear down the socket and back off for another attempt, exactly like
    // handleSocketFailure() elsewhere.
    expect(firstSocket.close).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(timings.retryBaseDelay);
    expect(h.createSocket).toHaveBeenCalledTimes(2);

    await conn.stop();
  });

  it("18. stop() triggers no further fetchSessionUrl calls even when the socket's close() synchronously fires onDisconnect", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "OK", url: "wss://a" });
    h.createSocket.mockImplementation(
      (_url: string, handlers: ChzzkSocketHandlers) => {
        const close = vi.fn(() => {
          handlers.onDisconnect();
        });
        return { close };
      },
    );
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    const callsBeforeStop = h.fetchSessionUrl.mock.calls.length;
    expect(callsBeforeStop).toBeGreaterThan(0);

    await conn.stop();

    await vi.advanceTimersByTimeAsync(10 * 60 * 60 * 1000);
    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(callsBeforeStop);
  });

  it("23. uses the documented default timings (1s retry base, 6h token refresh) when no timings override is given", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValueOnce({ status: "ERROR" });
    h.fetchSessionUrl.mockResolvedValue({ status: "OK", url: "wss://a" });
    const conn = createChzzkConnection(h.deps); // no `timings` arg -> defaults

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(1);

    // Default retryBaseDelay is 1000ms, not less.
    await vi.advanceTimersByTimeAsync(999);
    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(2);
    expect(h.createSocket).toHaveBeenCalledTimes(1);

    // Default tokenRefreshInterval is 6 hours.
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(h.refreshToken).toHaveBeenCalledTimes(1);

    await conn.stop();
  });

  it("24. stop() called while the first fetchSessionUrl() is still pending prevents that stale result from opening a socket", async () => {
    const h = createHarness();
    let resolveFetch!: (v: SessionUrlResult) => void;
    h.fetchSessionUrl.mockImplementation(
      () =>
        new Promise((res) => {
          resolveFetch = res;
        }),
    );
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(1);

    await conn.stop();
    resolveFetch({ status: "OK", url: "wss://late" });
    await vi.advanceTimersByTimeAsync(0);

    expect(h.createSocket).not.toHaveBeenCalled();
  });

  it("25. stop() called while refreshToken() is still pending (after an UNAUTHORIZED result) prevents any further action", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "UNAUTHORIZED" });
    let resolveRefresh!: (v: boolean) => void;
    h.refreshToken.mockImplementation(
      () =>
        new Promise((res) => {
          resolveRefresh = res;
        }),
    );
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.refreshToken).toHaveBeenCalledTimes(1);

    await conn.stop();
    resolveRefresh(true);
    await vi.advanceTimersByTimeAsync(0);

    // Must not fetch a second session URL, nor open a socket, after being
    // stopped mid-refresh.
    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(1);
    expect(h.createSocket).not.toHaveBeenCalled();
  });

  it("26. stop() called while the post-refresh fetchSessionUrl() is still pending prevents that stale result from opening a socket", async () => {
    const h = createHarness();
    let resolveSecondFetch!: (v: SessionUrlResult) => void;
    h.fetchSessionUrl
      .mockResolvedValueOnce({ status: "UNAUTHORIZED" })
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            resolveSecondFetch = res;
          }),
      );
    h.refreshToken.mockResolvedValue(true);
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(2);

    await conn.stop();
    resolveSecondFetch({ status: "OK", url: "wss://late" });
    await vi.advanceTimersByTimeAsync(0);

    expect(h.createSocket).not.toHaveBeenCalled();
  });

  it("27. stop() called while subscribeChat() is still pending prevents a stale subscribe result from scheduling a retry", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "OK", url: "wss://a" });
    let resolveSubscribe!: (v: boolean) => void;
    h.subscribeChat.mockImplementation(
      () =>
        new Promise((res) => {
          resolveSubscribe = res;
        }),
    );
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    const socket = h.latestSocket();
    socket.handlers.onMessage("SYSTEM", connectedMessage("sess-1"));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.subscribeChat).toHaveBeenCalledTimes(1);

    await conn.stop();
    resolveSubscribe(false); // a late, failed subscribe result
    await vi.advanceTimersByTimeAsync(timings.retryMaxDelay * 2);

    // Must not fetch a second session URL after being stopped, even though
    // the stale subscribe "failed".
    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(1);
  });

  it("28. SYSTEM 'subscribed'/'unsubscribed' messages are forwarded via onEvent with no other side effect", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "OK", url: "wss://a" });
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    const socket = h.latestSocket();
    // connectCycle()'s own success path already called onAuthRequired(false)
    // once during start() -- clear it so the assertion below is about the
    // "subscribed" message specifically, not connection setup.
    h.onAuthRequired.mockClear();

    const subscribedMessage = {
      type: "subscribed" as const,
      data: { eventType: "CHAT" as const, channelId: "ch1" },
    };
    socket.handlers.onMessage("SYSTEM", JSON.stringify(subscribedMessage));

    expect(h.onEvent).toHaveBeenCalledWith({
      type: "SYSTEM",
      message: subscribedMessage,
    });
    expect(h.subscribeChat).not.toHaveBeenCalled();
    expect(h.onAuthRequired).not.toHaveBeenCalled();
    expect(h.createSocket).toHaveBeenCalledTimes(1);

    await conn.stop();
  });

  it("29. calling start() while already running is a no-op (idempotent)", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "OK", url: "wss://a" });
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(1);

    conn.start(); // second call while already running
    await vi.advanceTimersByTimeAsync(0);

    expect(h.fetchSessionUrl).toHaveBeenCalledTimes(1);
    expect(conn.isRunning()).toBe(true);

    await conn.stop();
  });

  it("30. calling stop() when never started is a no-op (does not throw, never touches unsubscribeChat/closeSocket)", async () => {
    const h = createHarness();
    const conn = createChzzkConnection(h.deps, timings);

    await expect(conn.stop()).resolves.toBeUndefined();

    expect(conn.isRunning()).toBe(false);
    expect(h.unsubscribeChat).not.toHaveBeenCalled();
    expect(h.fetchSessionUrl).not.toHaveBeenCalled();
  });

  // Watchdog: SYSTEM `unsubscribed`, new-broadcast detection via
  // fetchLiveSignal(), and the subscription-health probe via
  // fetchSubscriptionHealth(). All of these funnel through the same
  // forceReconnect() helper, so most assertions below just check for a
  // fresh fetchSessionUrl()/createSocket() pair.

  it("31. SYSTEM unsubscribed for CHAT forces a fresh session fetch and resubscribe; for DONATION it is a no-op", async () => {
    const h = createHarness();
    h.fetchSessionUrl
      .mockResolvedValueOnce({ status: "OK", url: "wss://first" })
      .mockResolvedValueOnce({ status: "OK", url: "wss://second" });
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    h.latestSocket().handlers.onMessage("SYSTEM", connectedMessage("sess-1"));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.subscribeChat).toHaveBeenCalledWith("sess-1");

    const socket = h.latestSocket();
    const callsBefore = h.fetchSessionUrl.mock.calls.length;

    // DONATION unsubscribe: no effect at all.
    socket.handlers.onMessage("SYSTEM", unsubscribedMessage("DONATION"));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.fetchSessionUrl.mock.calls.length).toBe(callsBefore);
    expect(socket.close).not.toHaveBeenCalled();

    // CHAT unsubscribe: forces an immediate reconnect (no backoff wait).
    socket.handlers.onMessage("SYSTEM", unsubscribedMessage("CHAT"));
    await vi.advanceTimersByTimeAsync(0);

    expect(socket.close).toHaveBeenCalled();
    expect(h.fetchSessionUrl.mock.calls.length).toBe(callsBefore + 1);
    expect(h.createSocket).toHaveBeenCalledTimes(2);
    expect(h.createSocket.mock.calls[1][0]).toBe("wss://second");

    h.latestSocket().handlers.onMessage("SYSTEM", connectedMessage("sess-2"));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.subscribeChat).toHaveBeenCalledWith("sess-2");

    await conn.stop();
  });

  it("32. the first fetchLiveSignal OPEN observation only baselines chatChannelId, no reconnect", async () => {
    const h = createHarness();
    h.deps.fetchLiveSignal = vi.fn(async () => ({
      status: "OPEN" as const,
      chatChannelId: "chat-1",
    }));
    const wt = { ...timings, watchdogInterval: 10_000 };
    const conn = createChzzkConnection(h.deps, wt);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    const socket = h.latestSocket();
    const callsBefore = h.fetchSessionUrl.mock.calls.length;

    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);

    expect(h.deps.fetchLiveSignal).toHaveBeenCalledTimes(1);
    expect(socket.close).not.toHaveBeenCalled();
    expect(h.fetchSessionUrl.mock.calls.length).toBe(callsBefore);

    await conn.stop();
  });

  it("33. a changed chatChannelId reconnects exactly once and resubscribes; an unchanged one does not reconnect again", async () => {
    const h = createHarness();
    let chatChannelId = "chat-1";
    h.deps.fetchLiveSignal = vi.fn(async () => ({
      status: "OPEN" as const,
      chatChannelId,
    }));
    h.fetchSessionUrl
      .mockResolvedValueOnce({ status: "OK", url: "wss://first" })
      .mockResolvedValueOnce({ status: "OK", url: "wss://second" });
    const wt = { ...timings, watchdogInterval: 10_000 };
    const conn = createChzzkConnection(h.deps, wt);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    h.latestSocket().handlers.onMessage("SYSTEM", connectedMessage("sess-1"));
    await vi.advanceTimersByTimeAsync(0);

    // First tick: baseline only, no reconnect yet.
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    expect(h.createSocket).toHaveBeenCalledTimes(1);

    // New broadcast: chatChannelId changes -> exactly one reconnect.
    chatChannelId = "chat-2";
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);

    expect(h.createSocket).toHaveBeenCalledTimes(2);
    expect(h.createSocket.mock.calls[1][0]).toBe("wss://second");

    h.latestSocket().handlers.onMessage("SYSTEM", connectedMessage("sess-2"));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.subscribeChat).toHaveBeenCalledWith("sess-2");

    // Same chatChannelId again on later ticks: no further reconnect.
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    expect(h.createSocket).toHaveBeenCalledTimes(2);

    await conn.stop();
  });

  it("34. OPEN-with-null/CLOSED/UNKNOWN signals are inert and never clear the recorded id (CLOSED-then-new-OPEN still reconnects)", async () => {
    const h = createHarness();
    const fetchLiveSignal = vi.fn();
    h.deps.fetchLiveSignal = fetchLiveSignal;
    h.fetchSessionUrl
      .mockResolvedValueOnce({ status: "OK", url: "wss://first" })
      .mockResolvedValueOnce({ status: "OK", url: "wss://second" });
    const wt = { ...timings, watchdogInterval: 10_000 };
    const conn = createChzzkConnection(h.deps, wt);

    fetchLiveSignal.mockResolvedValueOnce({
      status: "OPEN",
      chatChannelId: "chat-1",
    }); // baseline
    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    expect(h.createSocket).toHaveBeenCalledTimes(1);

    fetchLiveSignal.mockResolvedValueOnce({
      status: "OPEN",
      chatChannelId: null,
    });
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    expect(h.createSocket).toHaveBeenCalledTimes(1);

    fetchLiveSignal.mockResolvedValueOnce({ status: "CLOSED" });
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    expect(h.createSocket).toHaveBeenCalledTimes(1);

    fetchLiveSignal.mockResolvedValueOnce({ status: "UNKNOWN" });
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    expect(h.createSocket).toHaveBeenCalledTimes(1);

    // A genuinely new broadcast: the id recorded at the very first
    // observation must still be intact, so this is correctly detected as a
    // change (not mistaken for a fresh first observation).
    fetchLiveSignal.mockResolvedValueOnce({
      status: "OPEN",
      chatChannelId: "chat-2",
    });
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    expect(h.createSocket).toHaveBeenCalledTimes(2);
    expect(h.createSocket.mock.calls[1][0]).toBe("wss://second");

    await conn.stop();
  });

  it("35. fetchSubscriptionHealth 'LOST' forces a reconnect; 'SUBSCRIBED' and 'UNKNOWN' do not", async () => {
    const h = createHarness();
    const fetchSubscriptionHealth = vi.fn();
    h.deps.fetchSubscriptionHealth = fetchSubscriptionHealth;
    h.fetchSessionUrl
      .mockResolvedValueOnce({ status: "OK", url: "wss://first" })
      .mockResolvedValueOnce({ status: "OK", url: "wss://second" });
    const wt = { ...timings, watchdogInterval: 10_000 };
    const conn = createChzzkConnection(h.deps, wt);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    h.latestSocket().handlers.onMessage("SYSTEM", connectedMessage("sess-1"));
    await vi.advanceTimersByTimeAsync(0);

    fetchSubscriptionHealth.mockResolvedValueOnce("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    expect(fetchSubscriptionHealth).toHaveBeenCalledWith("sess-1");
    expect(h.createSocket).toHaveBeenCalledTimes(1);

    fetchSubscriptionHealth.mockResolvedValueOnce("UNKNOWN");
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    expect(h.createSocket).toHaveBeenCalledTimes(1);

    fetchSubscriptionHealth.mockResolvedValueOnce("LOST");
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    expect(h.createSocket).toHaveBeenCalledTimes(2);
    expect(h.createSocket.mock.calls[1][0]).toBe("wss://second");

    await conn.stop();
  });

  it("36. a throwing fetchLiveSignal/fetchSubscriptionHealth is swallowed as UNKNOWN and does not kill later watchdog ticks", async () => {
    const h = createHarness();
    const fetchLiveSignal = vi.fn();
    h.deps.fetchLiveSignal = fetchLiveSignal;
    h.deps.fetchSubscriptionHealth = vi.fn(async () => {
      throw new Error("subscription health boom");
    });
    const wt = { ...timings, watchdogInterval: 10_000 };
    const conn = createChzzkConnection(h.deps, wt);

    // Subscribe-time baseline capture (call 1) also throws.
    fetchLiveSignal.mockRejectedValueOnce(new Error("live signal boom"));
    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    h.latestSocket().handlers.onMessage("SYSTEM", connectedMessage("sess-1"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchLiveSignal).toHaveBeenCalledTimes(1);

    // First tick: fetchLiveSignal() throws again (call 2) -> treated as
    // UNKNOWN, inert, still unbaselined. fetchSubscriptionHealth() is
    // independent (not gated on the live signal) and also throws -> also
    // inert. Neither kills the watchdog.
    fetchLiveSignal.mockRejectedValueOnce(new Error("live signal boom 2"));
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    expect(fetchLiveSignal).toHaveBeenCalledTimes(2);
    expect(h.deps.fetchSubscriptionHealth).toHaveBeenCalledTimes(1);
    expect(h.createSocket).toHaveBeenCalledTimes(1);

    // Second tick runs normally: fetchLiveSignal() now resolves (still no
    // baseline recorded, so this only baselines) and fetchSubscriptionHealth()
    // throws again -> still inert.
    fetchLiveSignal.mockResolvedValueOnce({
      status: "OPEN",
      chatChannelId: "chat-1",
    });
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    expect(fetchLiveSignal).toHaveBeenCalledTimes(3);
    expect(h.deps.fetchSubscriptionHealth).toHaveBeenCalledTimes(2);
    expect(h.createSocket).toHaveBeenCalledTimes(1);

    await conn.stop();
  });

  it("37. the watchdog stops firing after stop()", async () => {
    const h = createHarness();
    const fetchLiveSignal = vi.fn(async () => ({
      status: "OPEN" as const,
      chatChannelId: "chat-1",
    }));
    h.deps.fetchLiveSignal = fetchLiveSignal;
    const wt = { ...timings, watchdogInterval: 10_000 };
    const conn = createChzzkConnection(h.deps, wt);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    expect(fetchLiveSignal).toHaveBeenCalledTimes(1);

    await conn.stop();
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval * 5);
    expect(fetchLiveSignal).toHaveBeenCalledTimes(1);
  });

  it("38. a forced reconnect does not consume the backoff schedule: the next real socket failure still retries at the base delay", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "OK", url: "wss://a" });
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);

    // Burn failureCount via one real socket failure first.
    h.latestSocket().handlers.onError(new Error("connect_error"));
    await vi.advanceTimersByTimeAsync(timings.retryBaseDelay);
    expect(h.createSocket).toHaveBeenCalledTimes(2);

    // A deliberate reconnect via `unsubscribed` must reset failureCount.
    h.latestSocket().handlers.onMessage("SYSTEM", unsubscribedMessage("CHAT"));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.createSocket).toHaveBeenCalledTimes(3);

    // The next real failure must retry at the base delay (not doubled),
    // proving the forced reconnect reset failureCount to 0.
    const socket = h.latestSocket();
    socket.handlers.onError(new Error("connect_error again"));
    await vi.advanceTimersByTimeAsync(timings.retryBaseDelay - 1);
    expect(h.createSocket).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.createSocket).toHaveBeenCalledTimes(4);

    await conn.stop();
  });

  it("39. with fetchLiveSignal/fetchSubscriptionHealth both omitted, the watchdog timer fires but has no effect (regression guard)", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "OK", url: "wss://a" });
    const wt = { ...timings, watchdogInterval: 10_000 };
    const conn = createChzzkConnection(h.deps, wt);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    const socket = h.latestSocket();
    const callsBefore = h.fetchSessionUrl.mock.calls.length;

    await vi.advanceTimersByTimeAsync(wt.watchdogInterval * 10);

    expect(h.fetchSessionUrl.mock.calls.length).toBe(callsBefore);
    expect(socket.close).not.toHaveBeenCalled();
    expect(h.createSocket).toHaveBeenCalledTimes(1);

    await conn.stop();
  });

  it("40. uses the documented default watchdogInterval (60s) when no timings override is given", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "OK", url: "wss://a" });
    h.deps.fetchLiveSignal = vi.fn(async () => ({
      status: "OPEN" as const,
      chatChannelId: "chat-1",
    }));
    const conn = createChzzkConnection(h.deps); // no `timings` arg -> defaults

    conn.start();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(60_000 - 1);
    expect(h.deps.fetchLiveSignal).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.deps.fetchLiveSignal).toHaveBeenCalledTimes(1);

    await conn.stop();
  });

  it("41. an in-flight watchdog tick is not re-entered by the next timer fire", async () => {
    const h = createHarness();
    let resolveSignal!: (v: ChzzkLiveSignal) => void;
    const fetchLiveSignal = vi.fn(
      () =>
        new Promise<ChzzkLiveSignal>((res) => {
          resolveSignal = res;
        }),
    );
    h.deps.fetchLiveSignal = fetchLiveSignal;
    const wt = { ...timings, watchdogInterval: 10_000 };
    const conn = createChzzkConnection(h.deps, wt);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);

    // First tick fires and leaves fetchLiveSignal() in flight.
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    expect(fetchLiveSignal).toHaveBeenCalledTimes(1);

    // The next timer fire happens while the first call is still pending: it
    // must be a no-op, not a second concurrent fetchLiveSignal() call.
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    expect(fetchLiveSignal).toHaveBeenCalledTimes(1);

    // Resolve the first call: first-ever observation, so it only baselines.
    resolveSignal({ status: "OPEN", chatChannelId: "chat-1" });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.createSocket).toHaveBeenCalledTimes(1);

    // The watchdog resumes normal ticking afterwards.
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    expect(fetchLiveSignal).toHaveBeenCalledTimes(2);

    await conn.stop();
  });

  it("42. stop() called while a watchdog tick's fetchLiveSignal() is still pending prevents a stale changed-id result from forcing a reconnect", async () => {
    const h = createHarness();
    const fetchLiveSignal = vi.fn();
    h.deps.fetchLiveSignal = fetchLiveSignal;
    h.fetchSessionUrl.mockResolvedValue({ status: "OK", url: "wss://a" });
    const wt = { ...timings, watchdogInterval: 10_000 };
    const conn = createChzzkConnection(h.deps, wt);

    // Subscribe-time capture (call 1): baseline to "chat-1".
    fetchLiveSignal.mockResolvedValueOnce({
      status: "OPEN",
      chatChannelId: "chat-1",
    });
    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    h.latestSocket().handlers.onMessage("SYSTEM", connectedMessage("sess-1"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchLiveSignal).toHaveBeenCalledTimes(1);
    expect(h.createSocket).toHaveBeenCalledTimes(1);

    // First watchdog tick starts (call 2), with fetchLiveSignal() left
    // pending.
    let resolveTick!: (v: ChzzkLiveSignal) => void;
    fetchLiveSignal.mockImplementationOnce(
      () =>
        new Promise<ChzzkLiveSignal>((res) => {
          resolveTick = res;
        }),
    );
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    expect(fetchLiveSignal).toHaveBeenCalledTimes(2);

    await conn.stop();
    const callsBeforeResolve = h.createSocket.mock.calls.length;

    // A late-arriving, changed chatChannelId must not force a reconnect on a
    // connection that has already stopped.
    resolveTick({ status: "OPEN", chatChannelId: "chat-2" });
    await vi.advanceTimersByTimeAsync(0);

    expect(h.createSocket.mock.calls.length).toBe(callsBeforeResolve);
  });

  // Follow-up fix: the rule "the first observation only baselines" assumed
  // the connection is always established while a broadcast is already live.
  // The dominant real-world order is the opposite -- OBS starts (and
  // subscribes) while the channel is offline, and only later goes live. The
  // baseline must therefore be captured at *subscribe time*
  // (captureLiveSignalBaseline(), fired from handleSubscribe()'s success
  // path), not at the watchdog's own first tick, or that transition is
  // missed entirely. lastChatChannelId is now `string | null | undefined`:
  // `null` is a real recorded baseline ("subscribed while offline"), not an
  // absence.

  it("43. a subscription established while the channel was offline reconnects on the very next real broadcast (the OBS-starts-before-going-live case)", async () => {
    const h = createHarness();
    const fetchLiveSignal = vi.fn();
    h.deps.fetchLiveSignal = fetchLiveSignal;
    h.fetchSessionUrl
      .mockResolvedValueOnce({ status: "OK", url: "wss://first" })
      .mockResolvedValueOnce({ status: "OK", url: "wss://second" });
    const wt = { ...timings, watchdogInterval: 10_000 };
    const conn = createChzzkConnection(h.deps, wt);

    // Subscribe happens while the channel is offline.
    fetchLiveSignal.mockResolvedValueOnce({ status: "CLOSED" });
    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    h.latestSocket().handlers.onMessage("SYSTEM", connectedMessage("sess-1"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchLiveSignal).toHaveBeenCalledTimes(1);
    expect(h.createSocket).toHaveBeenCalledTimes(1);

    // The broadcaster goes live: the very first watchdog tick that observes
    // the new broadcast must reconnect immediately. Under the old "baseline
    // at first tick" rule this real id would have been mistaken for a first
    // observation and only baselined, silently missing the broadcast.
    fetchLiveSignal.mockResolvedValueOnce({
      status: "OPEN",
      chatChannelId: "chat-1",
    });
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);

    expect(h.createSocket).toHaveBeenCalledTimes(2);
    expect(h.createSocket.mock.calls[1][0]).toBe("wss://second");

    await conn.stop();
  });

  it("44. a subscription established during broadcast A is unaffected while A continues, and reconnects exactly once when B starts", async () => {
    const h = createHarness();
    const fetchLiveSignal = vi.fn();
    h.deps.fetchLiveSignal = fetchLiveSignal;
    h.fetchSessionUrl
      .mockResolvedValueOnce({ status: "OK", url: "wss://first" })
      .mockResolvedValueOnce({ status: "OK", url: "wss://second" });
    const wt = { ...timings, watchdogInterval: 10_000 };
    const conn = createChzzkConnection(h.deps, wt);

    // Subscribe happens during broadcast "A".
    fetchLiveSignal.mockResolvedValueOnce({
      status: "OPEN",
      chatChannelId: "A",
    });
    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    h.latestSocket().handlers.onMessage("SYSTEM", connectedMessage("sess-1"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchLiveSignal).toHaveBeenCalledTimes(1);

    // Same broadcast continues: no reconnect.
    fetchLiveSignal.mockResolvedValueOnce({
      status: "OPEN",
      chatChannelId: "A",
    });
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    expect(h.createSocket).toHaveBeenCalledTimes(1);

    // A different broadcast starts: exactly one reconnect.
    fetchLiveSignal.mockResolvedValue({ status: "OPEN", chatChannelId: "B" });
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    expect(h.createSocket).toHaveBeenCalledTimes(2);
    expect(h.createSocket.mock.calls[1][0]).toBe("wss://second");

    // "B" continues afterwards: no further reconnect.
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    expect(h.createSocket).toHaveBeenCalledTimes(2);

    await conn.stop();
  });

  it("45. a subscribe-time fetchLiveSignal() that can't tell (throws) leaves the connection unbaselined until a later tick observes a real id", async () => {
    const h = createHarness();
    const fetchLiveSignal = vi.fn();
    h.deps.fetchLiveSignal = fetchLiveSignal;
    h.fetchSessionUrl
      .mockResolvedValueOnce({ status: "OK", url: "wss://first" })
      .mockResolvedValueOnce({ status: "OK", url: "wss://second" });
    const wt = { ...timings, watchdogInterval: 10_000 };
    const conn = createChzzkConnection(h.deps, wt);

    // Subscribe-time capture can't tell.
    fetchLiveSignal.mockRejectedValueOnce(new Error("boom"));
    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    h.latestSocket().handlers.onMessage("SYSTEM", connectedMessage("sess-1"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchLiveSignal).toHaveBeenCalledTimes(1);
    expect(h.createSocket).toHaveBeenCalledTimes(1);

    // First tick observes a real id for the first time: still no baseline
    // existed, so this only records it -- we genuinely cannot tell whether
    // this broadcast predates the subscription.
    fetchLiveSignal.mockResolvedValueOnce({
      status: "OPEN",
      chatChannelId: "chat-1",
    });
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    expect(h.createSocket).toHaveBeenCalledTimes(1);

    // Second tick: a different id is now a genuine change -> reconnect.
    fetchLiveSignal.mockResolvedValueOnce({
      status: "OPEN",
      chatChannelId: "chat-2",
    });
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    expect(h.createSocket).toHaveBeenCalledTimes(2);
    expect(h.createSocket.mock.calls[1][0]).toBe("wss://second");

    await conn.stop();
  });

  it("46. a slow/hanging subscribe-time fetchLiveSignal() does not delay or break the subscribe success path", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "OK", url: "wss://a" });
    let resolveSignal: ((v: ChzzkLiveSignal) => void) | undefined;
    h.deps.fetchLiveSignal = vi.fn(
      () =>
        new Promise<ChzzkLiveSignal>((res) => {
          resolveSignal = res;
        }),
    );
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    h.latestSocket().handlers.onMessage("SYSTEM", connectedMessage("sess-1"));
    await vi.advanceTimersByTimeAsync(0);

    // subscribeChat() already succeeded and failureCount was reset without
    // waiting on fetchLiveSignal(), which is still hanging.
    expect(h.subscribeChat).toHaveBeenCalledWith("sess-1");
    expect(resolveSignal).toBeDefined();
    expect(h.latestSocket().close).not.toHaveBeenCalled();

    // A real socket failure right after must retry at the (unconsumed) base
    // delay, proving the pending baseline capture never touched failureCount
    // or otherwise blocked the connection's own state machine.
    h.latestSocket().handlers.onError(new Error("connect_error"));
    await vi.advanceTimersByTimeAsync(timings.retryBaseDelay - 1);
    expect(h.createSocket).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.createSocket).toHaveBeenCalledTimes(2);

    await conn.stop();

    // The still-pending capture resolving well after stop() must not throw.
    expect(() =>
      resolveSignal?.({ status: "OPEN", chatChannelId: "chat-1" }),
    ).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
  });

  it("47. a subscribe-time fetchLiveSignal() that resolves after stop() does not throw and has no observable effect", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "OK", url: "wss://a" });
    let resolveSignal!: (v: ChzzkLiveSignal) => void;
    h.deps.fetchLiveSignal = vi.fn(
      () =>
        new Promise<ChzzkLiveSignal>((res) => {
          resolveSignal = res;
        }),
    );
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    h.latestSocket().handlers.onMessage("SYSTEM", connectedMessage("sess-1"));
    await vi.advanceTimersByTimeAsync(0);

    await conn.stop();

    expect(() =>
      resolveSignal({ status: "OPEN", chatChannelId: "chat-1" }),
    ).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.createSocket).toHaveBeenCalledTimes(1);
  });

  it("48. a subscribe-time fetchLiveSignal() that resolves after a newer generation exists does not overwrite the newer baseline", async () => {
    const h = createHarness();
    h.fetchSessionUrl
      .mockResolvedValueOnce({ status: "OK", url: "wss://first" })
      .mockResolvedValueOnce({ status: "OK", url: "wss://second" });
    const resolvers: ((v: ChzzkLiveSignal) => void)[] = [];
    const fetchLiveSignal = vi.fn(
      () =>
        new Promise<ChzzkLiveSignal>((res) => {
          resolvers.push(res);
        }),
    );
    h.deps.fetchLiveSignal = fetchLiveSignal;
    const wt = { ...timings, watchdogInterval: 10_000 };
    const conn = createChzzkConnection(h.deps, wt);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    h.latestSocket().handlers.onMessage("SYSTEM", connectedMessage("sess-1"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchLiveSignal).toHaveBeenCalledTimes(1); // resolvers[0], gen 1

    // Force a reconnect (bumps generation) while the first baseline capture
    // is still pending.
    h.latestSocket().handlers.onMessage("SYSTEM", unsubscribedMessage("CHAT"));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.createSocket).toHaveBeenCalledTimes(2);

    // The new subscription re-captures its own baseline.
    h.latestSocket().handlers.onMessage("SYSTEM", connectedMessage("sess-2"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchLiveSignal).toHaveBeenCalledTimes(2); // resolvers[1], gen 2

    // The current (newer) baseline resolves first, to "fresh".
    resolvers[1]({ status: "OPEN", chatChannelId: "fresh" });
    await vi.advanceTimersByTimeAsync(0);

    // The stale capture from before the reconnect resolves afterwards, with
    // a *different* id. It must be discarded, not overwrite the current
    // baseline.
    resolvers[0]({ status: "OPEN", chatChannelId: "stale-value" });
    await vi.advanceTimersByTimeAsync(0);

    // Proof: a tick reporting the same id as the (correct) newer baseline
    // must not reconnect. If the stale write had won instead, this "fresh"
    // would look like a change from "stale-value" and wrongly reconnect.
    fetchLiveSignal.mockResolvedValueOnce({
      status: "OPEN",
      chatChannelId: "fresh",
    });
    await vi.advanceTimersByTimeAsync(wt.watchdogInterval);
    expect(h.createSocket).toHaveBeenCalledTimes(2);

    await conn.stop();
  });

  it("49. fetchLiveSignal omitted entirely -> subscribing has no extra side effect (regression guard)", async () => {
    const h = createHarness();
    h.fetchSessionUrl.mockResolvedValue({ status: "OK", url: "wss://a" });
    const conn = createChzzkConnection(h.deps, timings);

    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    h.latestSocket().handlers.onMessage("SYSTEM", connectedMessage("sess-1"));
    await vi.advanceTimersByTimeAsync(0);

    expect(h.subscribeChat).toHaveBeenCalledWith("sess-1");
    expect(h.createSocket).toHaveBeenCalledTimes(1);
    expect(h.latestSocket().close).not.toHaveBeenCalled();

    await conn.stop();
  });
});
