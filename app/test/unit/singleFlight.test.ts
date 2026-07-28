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

  it("rejects a call whose fn never settles once inFlightTimeoutMs elapses, and releases the key so the next call retries", async () => {
    vi.useFakeTimers();
    try {
      const flight = createSingleFlight<string>({
        cacheMs: 60_000,
        inFlightTimeoutMs: 5_000,
      });

      // A fn that never resolves or rejects, modeling a hung upstream $fetch
      // with no timeout of its own.
      const hungFn = vi.fn(() => new Promise<string>(() => {}));

      const pending = flight.run("key", hungFn);
      // Attach a rejection handler synchronously so Node/vitest never sees
      // this as an unhandled rejection while the timer is pending.
      const assertion = expect(pending).rejects.toThrow();

      await vi.advanceTimersByTimeAsync(5_000);
      await assertion;

      // The key must have been released: a second call invokes fn again
      // instead of joining the same dead in-flight promise.
      const fn2 = vi.fn(() => Promise.resolve("recovered"));
      const result = await flight.run("key", fn2);

      expect(result).toBe("recovered");
      expect(fn2).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("timeout error message does not contain the key (which may be a secret token)", async () => {
    vi.useFakeTimers();
    try {
      const flight = createSingleFlight<string>({
        cacheMs: 60_000,
        inFlightTimeoutMs: 5_000,
      });

      const secretKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
      const hungFn = vi.fn(() => new Promise<string>(() => {}));

      const pending = flight.run(secretKey, hungFn);

      let capturedError: Error | undefined;
      pending.catch((err) => {
        capturedError = err;
      });

      await vi.advanceTimersByTimeAsync(5_000);
      await vi.advanceTimersByTimeAsync(0);

      expect(capturedError).toBeDefined();
      expect(capturedError!.message).toMatch(/did not settle within/);
      // This is the actual regression guard: the error message must NOT leak
      // the key (which could be an access token, refresh token, or other
      // credential). If this assertion fails, the key is being logged.
      expect(capturedError!.message).not.toContain(secretKey);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not cache a value produced by a call that already timed out", async () => {
    vi.useFakeTimers();
    try {
      const flight = createSingleFlight<string>({
        cacheMs: 60_000,
        inFlightTimeoutMs: 5_000,
      });

      let resolveHung!: (value: string) => void;
      const hungFn = vi.fn(
        () =>
          new Promise<string>((resolve) => {
            resolveHung = resolve;
          }),
      );

      const pending = flight.run("key", hungFn);
      const assertion = expect(pending).rejects.toThrow();

      await vi.advanceTimersByTimeAsync(5_000);
      await assertion;

      // The original fn finally settles after the timeout already fired.
      // That must not throw an unhandled rejection and must not resurrect
      // a cache entry for the key.
      resolveHung("late value");
      await vi.advanceTimersByTimeAsync(0);

      expect(flight.size()).toBe(0);

      const fn2 = vi.fn(() => Promise.resolve("fresh"));
      const result = await flight.run("key", fn2);

      expect(result).toBe("fresh");
      expect(fn2).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("guards a late rejection (after the in-flight timeout already fired) from disturbing a new call that reused the released key", async () => {
    // Covers the rejection branch of the `if (timedOut) { return; }` guard
    // (the resolution-branch guard is already covered by "does not cache a
    // value produced by a call that already timed out" above). A fn whose
    // promise *rejects* only after inFlightTimeoutMs has elapsed must not
    // let that late rejection reach back into the `inFlight` map, because by
    // then the key may already belong to an unrelated, still-pending call.
    vi.useFakeTimers();
    try {
      const flight = createSingleFlight<string>({
        cacheMs: 60_000,
        inFlightTimeoutMs: 5_000,
      });

      let rejectLate!: (err: unknown) => void;
      const staleFn = vi.fn(
        () =>
          new Promise<string>((_resolve, reject) => {
            rejectLate = reject;
          }),
      );

      const first = flight.run("key", staleFn);
      const firstAssertion = expect(first).rejects.toThrow(
        /did not settle within/,
      );

      await vi.advanceTimersByTimeAsync(5_000);
      await firstAssertion;

      // A fresh call reuses the now-released key while `staleFn`'s promise
      // is still pending -- this models a real caller starting a new
      // attempt right after the timeout.
      let resolveSecond!: (value: string) => void;
      const secondFn = vi.fn(
        () =>
          new Promise<string>((resolve) => {
            resolveSecond = resolve;
          }),
      );
      const second = flight.run("key", secondFn);

      // The original call finally rejects, long after its own timeout. If
      // the guard did not exist, this handler would delete the "key" entry
      // that now belongs to the second, still-pending call -- breaking
      // single-flight collapsing for anyone calling run("key", ...) in this
      // window, and this rejection must also not surface as an unhandled
      // rejection.
      rejectLate(new Error("late failure"));
      await vi.advanceTimersByTimeAsync(0);

      const thirdFn = vi.fn(() => Promise.resolve("third"));
      const thirdPromise = flight.run("key", thirdFn);

      resolveSecond("second value");
      const [secondResult, thirdResult] = await Promise.all([
        second,
        thirdPromise,
      ]);

      expect(thirdFn).not.toHaveBeenCalled();
      expect(secondResult).toBe("second value");
      expect(thirdResult).toBe("second value");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not time out a call that settles before inFlightTimeoutMs (default limit does not interfere with normal use)", async () => {
    vi.useFakeTimers();
    try {
      const flight = createSingleFlight<string>({ cacheMs: 60_000 });
      const fn = vi.fn(() => Promise.resolve("value"));

      const result = await flight.run("key", fn);

      expect(result).toBe("value");
      expect(fn).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the timeout timer on normal settlement (no dangling timer keeping the process alive)", async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
    try {
      const flight = createSingleFlight<string>({
        cacheMs: 60_000,
        inFlightTimeoutMs: 5_000,
      });
      const fn = vi.fn(() => Promise.resolve("value"));

      await flight.run("key", fn);

      expect(clearTimeoutSpy).toHaveBeenCalled();
    } finally {
      clearTimeoutSpy.mockRestore();
      vi.useRealTimers();
    }
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
