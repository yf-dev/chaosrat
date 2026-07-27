import {
  createChzzkConnection,
  type ChzzkConnectionDeps,
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
});
