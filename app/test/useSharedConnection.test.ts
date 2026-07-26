import { effectScope, nextTick, ref } from "vue";
import { useSharedConnection } from "../composables/useSharedConnection";

// These tests drive the real `broadcast-channel` leader election with
// `type: "simulate"` so multiple "tabs" can talk in-process, and with small
// election timings so elections settle quickly. Real timers are required:
// `broadcast-channel` internals (setTimeout-based sleeps, promise chains)
// do not cooperate with vi.useFakeTimers().

const FAST_ELECTION = { fallbackInterval: 200, responseTime: 50 };

let counter = 0;
function uniqueChannelName() {
  counter += 1;
  return `test-shared-connection-${Date.now()}-${counter}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 3000,
  intervalMs = 20,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor: timed out waiting for condition");
    }
    await sleep(intervalMs);
  }
}

describe("useSharedConnection", () => {
  it("a single tab wins leadership exactly once", async () => {
    const channelName = uniqueChannelName();
    const onBecomeLeader = vi.fn();
    const scope = effectScope();

    const inst = scope.run(() =>
      useSharedConnection<number>(channelName, {
        onData: () => {},
        onBecomeLeader,
        type: "simulate",
        electionOptions: FAST_ELECTION,
      }),
    )!;

    try {
      await waitFor(() => inst.isLeader.value === true);
      expect(onBecomeLeader).toHaveBeenCalledTimes(1);
    } finally {
      scope.stop();
    }
  });

  it("elects exactly one leader among three tabs on the same channel", async () => {
    const channelName = uniqueChannelName();
    const scopes = [] as ReturnType<typeof effectScope>[];
    const insts = [] as ReturnType<typeof useSharedConnection<number>>[];
    const becomeLeaderCalls = [0, 0, 0];

    for (let i = 0; i < 3; i++) {
      const scope = effectScope();
      const idx = i;
      const inst = scope.run(() =>
        useSharedConnection<number>(channelName, {
          onData: () => {},
          onBecomeLeader: () => {
            becomeLeaderCalls[idx] += 1;
          },
          type: "simulate",
          electionOptions: FAST_ELECTION,
        }),
      )!;
      scopes.push(scope);
      insts.push(inst);
    }

    try {
      await waitFor(() => insts.some((inst) => inst.isLeader.value === true));
      // Give the election extra time to fully settle across all three tabs.
      await sleep(400);

      const leaderCount = insts.filter((inst) => inst.isLeader.value).length;
      expect(leaderCount).toBe(1);
      expect(becomeLeaderCalls.reduce((a, b) => a + b, 0)).toBe(1);
    } finally {
      scopes.forEach((scope) => scope.stop());
    }
  });

  it("promotes a new leader when the current leader closes", async () => {
    const channelName = uniqueChannelName();
    const scopes = [] as ReturnType<typeof effectScope>[];
    const insts = [] as ReturnType<typeof useSharedConnection<number>>[];

    for (let i = 0; i < 3; i++) {
      const scope = effectScope();
      const inst = scope.run(() =>
        useSharedConnection<number>(channelName, {
          onData: () => {},
          type: "simulate",
          electionOptions: FAST_ELECTION,
        }),
      )!;
      scopes.push(scope);
      insts.push(inst);
    }

    try {
      await waitFor(() => insts.some((inst) => inst.isLeader.value === true));
      const leaderIndex = insts.findIndex((inst) => inst.isLeader.value);
      expect(leaderIndex).toBeGreaterThanOrEqual(0);

      await insts[leaderIndex].close();

      await waitFor(() =>
        insts.some(
          (inst, i) => i !== leaderIndex && inst.isLeader.value === true,
        ),
      );

      const newLeaders = insts.filter(
        (inst, i) => i !== leaderIndex && inst.isLeader.value,
      );
      expect(newLeaders.length).toBe(1);
    } finally {
      scopes.forEach((scope) => scope.stop());
    }
  });

  it("[bug 1] calls onLoseLeader before switching to a new channel name, and onBecomeLeader fires again", async () => {
    const channelNameRef = ref<string | undefined>(uniqueChannelName());
    const events: string[] = [];
    const scope = effectScope();

    const inst = scope.run(() =>
      useSharedConnection<number>(channelNameRef, {
        onData: () => {},
        onBecomeLeader: () => events.push("become"),
        onLoseLeader: () => events.push("lose"),
        type: "simulate",
        electionOptions: FAST_ELECTION,
      }),
    )!;

    try {
      // Alone on the channel, this tab must become leader.
      await waitFor(() => inst.isLeader.value === true);
      expect(events).toEqual(["become"]);

      // Switching channel name (mirrors the in-chat `!!set` command flow)
      // while this tab is the leader must release leadership of the old
      // channel before/while acquiring the new one.
      channelNameRef.value = uniqueChannelName();
      await nextTick();

      await waitFor(() => inst.isLeader.value === true);

      expect(events).toEqual(["become", "lose", "become"]);
    } finally {
      scope.stop();
    }
  });

  it("[bug 2] tearing down before leadership is won never becomes leader and never unhandled-rejects", async () => {
    // Node (unlike the vitest `node` environment description one might
    // assume) actually ships a real `navigator.locks`, so `broadcast-channel`
    // picks its WebLock-based elector here, not the legacy message-based one.
    // That elector resolves leadership near-instantly when uncontested, so a
    // "close soon after creating" timing race can't reliably catch it before
    // it wins. Instead, force genuine contention: a first tab (`holder`)
    // wins leadership first, so the tab under test is left queued behind it
    // and provably cannot have won leadership yet.
    const channelName = uniqueChannelName();
    const holderScope = effectScope();
    const holder = holderScope.run(() =>
      useSharedConnection<number>(channelName, {
        onData: () => {},
        type: "simulate",
        electionOptions: FAST_ELECTION,
      }),
    )!;
    await waitFor(() => holder.isLeader.value === true);

    const onBecomeLeader = vi.fn();
    const scope = effectScope();
    const inst = scope.run(() =>
      useSharedConnection<number>(channelName, {
        onData: () => {},
        onBecomeLeader,
        type: "simulate",
        electionOptions: FAST_ELECTION,
      }),
    )!;

    const unhandled: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandledRejection);

    try {
      // `inst` is now queued behind `holder`'s leadership and cannot have
      // won it yet. Tear it down while still queued.
      await sleep(20);
      await inst.close();

      // Release the holder so, if `inst` were still (incorrectly) waiting
      // to become leader, it would get the chance to.
      await holder.close();
      await sleep(600);

      expect(unhandled).toEqual([]);
      expect(inst.isLeader.value).toBe(false);
      expect(onBecomeLeader).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
      scope.stop();
      holderScope.stop();
    }
  });

  it("sendData delivers to other tabs' onData and to its own onData", async () => {
    const channelName = uniqueChannelName();
    const dataA: number[] = [];
    const dataB: number[] = [];
    const scopeA = effectScope();
    const scopeB = effectScope();

    const a = scopeA.run(() =>
      useSharedConnection<number>(channelName, {
        onData: (d) => dataA.push(d),
        type: "simulate",
        electionOptions: FAST_ELECTION,
      }),
    )!;
    scopeB.run(() =>
      useSharedConnection<number>(channelName, {
        onData: (d) => dataB.push(d),
        type: "simulate",
        electionOptions: FAST_ELECTION,
      }),
    );

    try {
      // Let both tabs' channels finish their (microtask-deferred) setup
      // before sending, so the message actually has a channel to post over.
      await sleep(10);
      a.sendData(42);
      await waitFor(() => dataA.includes(42) && dataB.includes(42));

      expect(dataA).toEqual([42]);
      expect(dataB).toEqual([42]);
    } finally {
      scopeA.stop();
      scopeB.stop();
    }
  });

  it("stops posting to other tabs after close()", async () => {
    const channelName = uniqueChannelName();
    const dataB: number[] = [];
    const scopeA = effectScope();
    const scopeB = effectScope();

    const a = scopeA.run(() =>
      useSharedConnection<number>(channelName, {
        onData: () => {},
        type: "simulate",
        electionOptions: FAST_ELECTION,
      }),
    )!;
    scopeB.run(() =>
      useSharedConnection<number>(channelName, {
        onData: (d) => dataB.push(d),
        type: "simulate",
        electionOptions: FAST_ELECTION,
      }),
    );

    try {
      // Let both tabs' channels finish their (microtask-deferred) setup.
      await sleep(10);

      // Sanity check the channel actually delivers before closing it.
      a.sendData(1);
      await waitFor(() => dataB.includes(1));

      await a.close();

      a.sendData(99);
      await sleep(200);

      expect(dataB).not.toContain(99);
    } finally {
      scopeA.stop();
      scopeB.stop();
    }
  });

  it("scope.stop() while leader calls onLoseLeader", async () => {
    const channelName = uniqueChannelName();
    const events: string[] = [];
    const scope = effectScope();

    const inst = scope.run(() =>
      useSharedConnection<number>(channelName, {
        onData: () => {},
        onBecomeLeader: () => events.push("become"),
        onLoseLeader: () => events.push("lose"),
        type: "simulate",
        electionOptions: FAST_ELECTION,
      }),
    )!;

    await waitFor(() => inst.isLeader.value === true);
    expect(events).toEqual(["become"]);

    scope.stop();
    // onScopeDispose handlers run synchronously as part of scope.stop(),
    // but the composable's close() is async -- give it a tick.
    await nextTick();
    await sleep(50);

    expect(events).toEqual(["become", "lose"]);
  });
});
