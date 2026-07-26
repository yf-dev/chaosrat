export interface SingleFlightOptions {
  /** How long a successful result stays available to later callers, in ms. */
  cacheMs: number;
}

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

    const promise = fn().then(
      (value) => {
        inFlight.delete(key);
        cache.set(key, { value, expiresAt: Date.now() + options.cacheMs });
        return value;
      },
      (error) => {
        inFlight.delete(key);
        throw error;
      },
    );

    inFlight.set(key, promise);
    return promise;
  }

  return { run, size: () => cache.size };
}
