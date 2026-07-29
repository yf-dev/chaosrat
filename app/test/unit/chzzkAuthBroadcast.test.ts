import {
  createChzzkAuthBroadcast,
  CHZZK_AUTH_CHANNEL_NAME,
  selectAuthChannelFactory,
  createNoopAuthChannel,
  type AuthBroadcastChannel,
  type ChzzkAuthBroadcastDeps,
  type ChzzkAuthState,
} from "~/lib/chzzkAuthBroadcast";

// A fake AuthBroadcastChannel that records every posted message and lets the
// test drive an inbound message directly through `onmessage`, mirroring how
// the real `broadcast-channel` library would deliver a message from another
// tab (never back to the sender -- see the "no self-echo" comment in the
// implementation).
function createFakeChannel() {
  const posted: ChzzkAuthState[] = [];
  let closeCalls = 0;
  const channel: AuthBroadcastChannel = {
    postMessage: vi.fn((message: ChzzkAuthState) => {
      posted.push(message);
    }),
    close: vi.fn(() => {
      closeCalls += 1;
    }),
    onmessage: null,
  };
  return {
    channel,
    posted,
    closeCallCount: () => closeCalls,
  };
}

function createHarness() {
  const fake = createFakeChannel();
  const createChannel = vi.fn((_name: string): AuthBroadcastChannel => {
    return fake.channel;
  });
  const onRemoteState = vi.fn();
  const deps: ChzzkAuthBroadcastDeps = {
    createChannel,
    onRemoteState,
  };
  return { fake, createChannel, onRemoteState, deps };
}

const AUTH_A: ChzzkAuthState = {
  status: "AUTHENTICATED",
  channelId: "ch1",
  channelName: "streamer1",
};
const AUTH_B: ChzzkAuthState = {
  status: "AUTHENTICATED",
  channelId: "ch2",
  channelName: "streamer2",
};
const LOGIN_REQUIRED: ChzzkAuthState = { status: "LOGIN_REQUIRED" };

describe("createChzzkAuthBroadcast", () => {
  it("creates the channel with the fixed, channel-id-independent name", () => {
    const h = createHarness();
    createChzzkAuthBroadcast(h.deps);

    expect(h.createChannel).toHaveBeenCalledTimes(1);
    expect(h.createChannel).toHaveBeenCalledWith(CHZZK_AUTH_CHANNEL_NAME);
  });

  it("forwards an incoming message to onRemoteState", () => {
    const h = createHarness();
    createChzzkAuthBroadcast(h.deps);

    expect(h.fake.channel.onmessage).toBeTypeOf("function");
    h.fake.channel.onmessage!(AUTH_A);

    expect(h.onRemoteState).toHaveBeenCalledTimes(1);
    expect(h.onRemoteState).toHaveBeenCalledWith(AUTH_A);
  });

  it("publish() posts the first state", () => {
    const h = createHarness();
    const broadcast = createChzzkAuthBroadcast(h.deps);

    broadcast.publish(LOGIN_REQUIRED);

    expect(h.fake.posted).toEqual([LOGIN_REQUIRED]);
  });

  it("publish() de-duplicates an identical repeat", () => {
    const h = createHarness();
    const broadcast = createChzzkAuthBroadcast(h.deps);

    broadcast.publish(AUTH_A);
    broadcast.publish({ ...AUTH_A });

    expect(h.fake.posted).toEqual([AUTH_A]);
  });

  it("publish() posts again when the state actually changes (different channelId)", () => {
    const h = createHarness();
    const broadcast = createChzzkAuthBroadcast(h.deps);

    broadcast.publish(AUTH_A);
    broadcast.publish(AUTH_B);

    expect(h.fake.posted).toEqual([AUTH_A, AUTH_B]);
  });

  it("publish() posts again when status changes (AUTHENTICATED -> LOGIN_REQUIRED)", () => {
    const h = createHarness();
    const broadcast = createChzzkAuthBroadcast(h.deps);

    broadcast.publish(AUTH_A);
    broadcast.publish(LOGIN_REQUIRED);

    expect(h.fake.posted).toEqual([AUTH_A, LOGIN_REQUIRED]);
  });

  it("publish() de-duplicates repeated LOGIN_REQUIRED", () => {
    const h = createHarness();
    const broadcast = createChzzkAuthBroadcast(h.deps);

    broadcast.publish(LOGIN_REQUIRED);
    broadcast.publish(LOGIN_REQUIRED);

    expect(h.fake.posted).toEqual([LOGIN_REQUIRED]);
  });

  it("close() closes the channel and silences later publish() calls", async () => {
    const h = createHarness();
    const broadcast = createChzzkAuthBroadcast(h.deps);

    await broadcast.close();
    expect(h.fake.closeCallCount()).toBe(1);

    broadcast.publish(AUTH_A);
    expect(h.fake.posted).toEqual([]);
  });

  it("close() is safe to call more than once", async () => {
    const h = createHarness();
    const broadcast = createChzzkAuthBroadcast(h.deps);

    await broadcast.close();
    await broadcast.close();

    expect(h.fake.closeCallCount()).toBe(1);
  });

  it("a throwing postMessage does not propagate out of publish()", () => {
    const h = createHarness();
    h.fake.channel.postMessage = vi.fn(() => {
      throw new Error("channel is closed");
    });
    const broadcast = createChzzkAuthBroadcast(h.deps);

    expect(() => broadcast.publish(AUTH_A)).not.toThrow();
  });
});

describe("selectAuthChannelFactory / createNoopAuthChannel", () => {
  it("opens a real channel on the client path", () => {
    const real: AuthBroadcastChannel = {
      postMessage: vi.fn(),
      close: vi.fn(),
      onmessage: null,
    };
    const openReal = vi.fn((_name: string) => real);

    const channel = selectAuthChannelFactory(true, openReal)("some-channel");

    expect(openReal).toHaveBeenCalledWith("some-channel");
    expect(channel).toBe(real);
  });

  it("returns a no-op channel on the server path without opening a real one", () => {
    const openReal = vi.fn();

    const channel = selectAuthChannelFactory(false, openReal)("some-channel");

    expect(openReal).not.toHaveBeenCalled();
    expect(channel.onmessage).toBeNull();
    // The no-op must satisfy the interface and do nothing when driven.
    expect(() => channel.postMessage(LOGIN_REQUIRED)).not.toThrow();
    expect(() => channel.close()).not.toThrow();
  });

  it("createNoopAuthChannel returns a fresh object each call", () => {
    expect(createNoopAuthChannel()).not.toBe(createNoopAuthChannel());
  });
});
