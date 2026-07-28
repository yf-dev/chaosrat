export interface SingleFlightOptions {
  /** How long a successful result stays available to later callers, in ms. */
  cacheMs: number;
  /**
   * How long a caller waits for `fn()` to settle before the in-flight entry
   * is released and the returned promise rejects, in ms. A single hung
   * upstream call (no timeout of its own) would otherwise poison the key
   * forever -- every later caller sharing that key would join the same dead
   * promise. Optional; defaults to 10s.
   */
  inFlightTimeoutMs?: number;
}

const DEFAULT_IN_FLIGHT_TIMEOUT_MS = 10_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export function createSingleFlight<T>(options: SingleFlightOptions): {
  run(key: string, fn: () => Promise<T>): Promise<T>;
  size(): number;
} {
  const inFlight = new Map<string, Promise<T>>();
  const cache = new Map<string, CacheEntry<T>>();
  const inFlightTimeoutMs =
    options.inFlightTimeoutMs ?? DEFAULT_IN_FLIGHT_TIMEOUT_MS;

  function sweepExpired() {
    const now = Date.now();
    for (const [k, entry] of cache) {
      if (entry.expiresAt <= now) {
        cache.delete(k);
      }
    }
  }

  function run(key: string, fn: () => Promise<T>): Promise<T> {
    sweepExpired();

    const cached = cache.get(key);
    if (cached) {
      if (cached.expiresAt > Date.now()) {
        return Promise.resolve(cached.value);
      }
      cache.delete(key);
    }

    const existing = inFlight.get(key);
    if (existing) {
      return existing;
    }

    // Tracks whether the timeout already fired and released this key, so a
    // late settlement of the underlying call knows not to touch the cache or
    // the (possibly already-reused) inFlight entry for this key.
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const racedPromise = new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        inFlight.delete(key);
        // Do NOT include `key` in the error message: callers key this helper on
        // secrets (e.g., access/refresh token cookie values), and the error gets
        // logged. Leaking the key to logs would be a credential leak.
        reject(
          new Error(
            `singleFlight: fn() did not settle within ${inFlightTimeoutMs}ms`,
          ),
        );
      }, inFlightTimeoutMs);

      fn().then(
        (value) => {
          clearTimeout(timer);
          if (timedOut) {
            // Already released/rejected on the timeout path -- do not
            // resurrect a cache entry or double-settle this promise.
            return;
          }
          inFlight.delete(key);
          cache.set(key, { value, expiresAt: Date.now() + options.cacheMs });
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          if (timedOut) {
            return;
          }
          inFlight.delete(key);
          reject(error);
        },
      );
    });

    // A late settlement (after the timeout already rejected) resolves or
    // rejects `racedPromise` a second time, which Promise silently ignores --
    // but nothing above ever throws on that path, so there is no unhandled
    // rejection either way.
    inFlight.set(key, racedPromise);
    return racedPromise;
  }

  return { run, size: () => cache.size };
}
