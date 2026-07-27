import { createSingleFlight } from "../../server/utils/singleFlight";

describe("createSingleFlight", () => {
  it("invokes fn exactly once for concurrent calls sharing a key, and all callers get the same value", async () => {
    const flight = createSingleFlight<string>({ cacheMs: 1000 });
    const fn = vi.fn(() => Promise.resolve("value"));

    const [a, b, c] = await Promise.all([
      flight.run("key", fn),
      flight.run("key", fn),
      flight.run("key", fn),
    ]);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(a).toBe("value");
    expect(b).toBe("value");
    expect(c).toBe("value");
  });

  it("invokes fn once per distinct key for concurrent calls", async () => {
    const flight = createSingleFlight<string>({ cacheMs: 1000 });
    const fn = vi.fn((key: string) => Promise.resolve(`value-${key}`));

    const [a, b] = await Promise.all([
      flight.run("key1", () => fn("key1")),
      flight.run("key2", () => fn("key2")),
    ]);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(a).toBe("value-key1");
    expect(b).toBe("value-key2");
  });

  it("returns the cached value for a call made after resolution but within cacheMs, without invoking fn again", async () => {
    vi.useFakeTimers();
    try {
      const flight = createSingleFlight<string>({ cacheMs: 60_000 });
      const fn = vi.fn(() => Promise.resolve("first"));

      const first = await flight.run("key", fn);
      expect(first).toBe("first");
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(30_000);

      // Even if a second caller would produce a different value, the cache wins:
      // this models a second tab still holding the old refresh-token cookie
      // getting the new token pair rather than a failure.
      const fn2 = vi.fn(() => Promise.resolve("second"));
      const second = await flight.run("key", fn2);

      expect(second).toBe("first");
      expect(fn2).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("invokes fn again once cacheMs has elapsed", async () => {
    vi.useFakeTimers();
    try {
      const flight = createSingleFlight<string>({ cacheMs: 60_000 });
      const fn1 = vi.fn(() => Promise.resolve("first"));

      const first = await flight.run("key", fn1);
      expect(first).toBe("first");

      await vi.advanceTimersByTimeAsync(60_001);

      const fn2 = vi.fn(() => Promise.resolve("second"));
      const second = await flight.run("key", fn2);

      expect(second).toBe("second");
      expect(fn2).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not cache a rejection: all concurrent callers see it, and the next call retries", async () => {
    const flight = createSingleFlight<string>({ cacheMs: 60_000 });

    let reject!: (err: unknown) => void;
    const deferred = new Promise<string>((_resolve, rej) => {
      reject = rej;
    });
    const fn = vi.fn(() => deferred);

    const p1 = flight.run("key", fn);
    const p2 = flight.run("key", fn);
    const p3 = flight.run("key", fn);

    const error = new Error("boom");
    reject(error);

    await expect(p1).rejects.toThrow("boom");
    await expect(p2).rejects.toThrow("boom");
    await expect(p3).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(1);

    const fn2 = vi.fn(() => Promise.resolve("recovered"));
    const result = await flight.run("key", fn2);

    expect(result).toBe("recovered");
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it("is safe to call again in the same tick after a rejection (no stuck in-flight entry)", async () => {
    const flight = createSingleFlight<string>({ cacheMs: 60_000 });

    const fn1 = vi.fn(() => Promise.reject(new Error("fail once")));
    await expect(flight.run("key", fn1)).rejects.toThrow("fail once");

    const fn2 = vi.fn(() => Promise.resolve("ok"));
    const result = await flight.run("key", fn2);

    expect(result).toBe("ok");
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it("treats an entry that expires between the sweep and the freshness check as expired, not stale-cached", async () => {
    // sweepExpired() and the `cached.expiresAt > Date.now()` check both call
    // Date.now() within the same synchronous run() call. If time is read as
    // having advanced between those two calls (e.g. a millisecond boundary),
    // an entry can survive the sweep (not yet `<=` the sweep's `now`) but
    // still fail the freshness check moments later -- run() must delete it
    // and recompute rather than serving it as if it were still fresh.
    const flight = createSingleFlight<string>({ cacheMs: 1_000 });
    const fn1 = vi.fn(() => Promise.resolve("first"));
    const nowSpy = vi.spyOn(Date, "now");

    nowSpy.mockReturnValue(0);
    const first = await flight.run("key", fn1);
    expect(first).toBe("first");
    // entry.expiresAt === 1000

    const fn2 = vi.fn(() => Promise.resolve("second"));
    // sweepExpired() sees now=999 (entry.expiresAt=1000 is not <= 999, so it
    // survives the sweep), but the freshness check right after sees now=1000
    // (not > 1000), so the entry must be treated as expired.
    nowSpy.mockReturnValueOnce(999).mockReturnValue(1000);
    const second = await flight.run("key", fn2);

    expect(second).toBe("second");
    expect(fn2).toHaveBeenCalledTimes(1);

    nowSpy.mockRestore();
  });

  it("evicts expired entries even when their key is never looked up again (no unbounded cache growth)", async () => {
    // Models the real caller: keys are one-shot CHZZK refresh-token values,
    // so an expired entry's key is never queried again and must not linger
    // in the cache forever. We can't see the private `cache` Map directly,
    // so we observe eviction behaviourally: run many distinct keys, let them
    // all expire, then trigger a sweep via one *fresh* key's run() call and
    // confirm the old keys' entries are gone by checking a size accessor
    // exposed for exactly this purpose.
    vi.useFakeTimers();
    try {
      const flight = createSingleFlight<string>({ cacheMs: 1_000 });

      for (let i = 0; i < 500; i++) {
        await flight.run(`key-${i}`, () => Promise.resolve(`value-${i}`));
      }
      expect(flight.size()).toBe(500);

      await vi.advanceTimersByTimeAsync(1_001);

      // A single new call is the only trigger available to production code
      // (no setInterval) — it must sweep out all the now-expired entries,
      // not just its own key.
      await flight.run("fresh-key", () => Promise.resolve("fresh-value"));

      expect(flight.size()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
