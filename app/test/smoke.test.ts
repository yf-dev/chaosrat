import { BroadcastChannel } from "broadcast-channel";
import { computed, effectScope, nextTick, ref, watch } from "vue";

describe("vitest harness smoke test", () => {
  it("runs a trivial assertion", () => {
    expect(1 + 1).toBe(2);
  });

  it("supports fake timers with setTimeout", async () => {
    vi.useFakeTimers();
    try {
      const callback = vi.fn();
      setTimeout(callback, 1000);

      expect(callback).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1000);
      expect(callback).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("delivers messages between two simulated broadcast-channel tabs", async () => {
    const channelName = `smoke-test-${Date.now()}`;
    const tabA = new BroadcastChannel(channelName, { type: "simulate" });
    const tabB = new BroadcastChannel(channelName, { type: "simulate" });

    try {
      const received = new Promise<unknown>((resolve) => {
        tabB.onmessage = (message) => resolve(message);
      });

      await tabA.postMessage({ hello: "world" });

      await expect(received).resolves.toEqual({ hello: "world" });
    } finally {
      await tabA.close();
      await tabB.close();
    }
  });

  it("reacts to ref mutation inside an effectScope, like a composable would", async () => {
    const scope = effectScope();
    let watcherCalls = 0;
    let lastValue = 0;

    const count = scope.run(() => {
      const count = ref(0);
      const doubled = computed(() => count.value * 2);

      watch(doubled, (value) => {
        watcherCalls += 1;
        lastValue = value;
      });

      return count;
    });

    expect(count).toBeDefined();

    count!.value = 5;
    await nextTick();

    expect(watcherCalls).toBe(1);
    expect(lastValue).toBe(10);

    scope.stop();

    // After stopping the scope, further mutations must not trigger the watcher.
    count!.value = 10;
    await nextTick();
    expect(watcherCalls).toBe(1);
  });
});
