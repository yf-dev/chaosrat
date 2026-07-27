import { effectScope, nextTick, ref } from "vue";
import { useSharedConnection } from "../../composables/useSharedConnection";

// `useSharedConnection.test.ts` drives the REAL `broadcast-channel` library
// (with `type: "simulate"`) end-to-end, but one of its internal branches is
// unreachable that way in this test environment:
//
// - The staleness guard inside `awaitLeadership().then(...)`
//   (`if (elector.value !== thisElector || thisElector.isDead) return;`):
//   reaching it via real timing requires a resolution that lands in the
//   narrow window between the underlying lock being granted and this tab's
//   own cleanup() reacting to a channel-name change -- not reliably
//   reproducible from outside the library without flaky, real-clock races.
//
// It's reachable and meaningfully testable by mocking `broadcast-channel`
// itself with a controllable fake elector, which is what this file does.
// This isn't testing a mock in a hollow sense -- the assertions exercise
// useSharedConnection.ts's OWN real staleness-guard logic against a double
// standing in for the library, exactly the way useChzzk.test.ts mocks
// useSharedConnection to isolate useChzzk's own logic.
//
// (There used to be a second branch here: `useSharedConnection.ts` assigning
// `thisElector.onduplicate`. That assignment was removed -- `broadcast-channel`
// always selects the WebLock-based elector in every environment this app
// targets, and that elector's `onduplicate` setter is a documented no-op, so
// the handler could never run. See `useSharedConnection.ts` for the details.)

interface FakeElector {
  isDead: boolean;
  awaitLeadership: () => Promise<void>;
  die: () => Promise<void>;
  resolveLeadership: () => void;
}

const { createLeaderElectionMock, channelCloseMock } = vi.hoisted(() => ({
  createLeaderElectionMock: vi.fn(),
  channelCloseMock: vi.fn(async () => {}),
}));

vi.mock("broadcast-channel", () => ({
  // Must be a real function (not an arrow function), so `new BroadcastChannel(...)`
  // (used by useSharedConnection.ts) is a valid construct call.
  BroadcastChannel: vi.fn(function BroadcastChannel() {
    return {
      close: channelCloseMock,
      postMessage: vi.fn(),
      onmessage: null,
    };
  }),
  createLeaderElection: createLeaderElectionMock,
}));

function makeFakeElector(): FakeElector {
  let resolveFn!: () => void;
  const promise = new Promise<void>((res) => {
    resolveFn = res;
  });
  const elector: FakeElector = {
    isDead: false,
    awaitLeadership: vi.fn(() => promise),
    die: vi.fn(async () => {
      elector.isDead = true;
    }),
    resolveLeadership: () => resolveFn(),
  };
  return elector;
}

describe("useSharedConnection (mocked broadcast-channel elector)", () => {
  beforeEach(() => {
    createLeaderElectionMock.mockReset();
    channelCloseMock.mockClear();
  });

  it("ignores a stale awaitLeadership() resolution that arrives after the channel/elector has already been superseded", async () => {
    const electorA = makeFakeElector();
    const electorB = makeFakeElector();
    createLeaderElectionMock
      .mockReturnValueOnce(electorA)
      .mockReturnValueOnce(electorB);

    const onBecomeLeader = vi.fn();
    const channelName = ref<string | undefined>("chan-a");
    const scope = effectScope();

    try {
      const inst = scope.run(() =>
        useSharedConnection<number>(channelName, {
          onData: () => {},
          onBecomeLeader,
        }),
      )!;

      // Switch channels while electorA's awaitLeadership() is still pending
      // -- this tears down electorA (die() marks it isDead) and stands up
      // electorB in its place.
      channelName.value = "chan-b";
      await nextTick();
      await Promise.resolve();
      await Promise.resolve();

      expect(electorA.die).toHaveBeenCalled();
      expect(electorA.isDead).toBe(true);

      // electorA's awaitLeadership() finally resolves -- too late. Its
      // `.then()` callback must see that `elector.value !== thisElector`
      // (electorB is current now) and/or `thisElector.isDead`, and bail out
      // without ever marking this tab as leader.
      electorA.resolveLeadership();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(inst.isLeader.value).toBe(false);
      expect(onBecomeLeader).not.toHaveBeenCalled();
    } finally {
      scope.stop();
    }
  });
});
