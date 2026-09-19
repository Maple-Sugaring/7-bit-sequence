/**
 * In-memory TTL cache standing in for the backend Redis layer.
 *
 * It deliberately mirrors Redis semantics (string keys, second-granularity
 * TTLs, prefix invalidation) so the read-through pattern in the repositories
 * does not change when the real cache moves server-side.
 */

const store = new Map();
const inFlight = new Map();

function isExpired(entry) {
  return entry.expiresAt !== Infinity && entry.expiresAt <= Date.now();
}

export function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (isExpired(entry)) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function set(key, value, ttlSeconds) {
  store.set(key, {
    value,
    expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : Infinity,
  });
  return value;
}

export function del(key) {
  store.delete(key);
}

/** Drops every key starting with `prefix`, the equivalent of a Redis SCAN + DEL. */
export function invalidatePrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function clear() {
  store.clear();
  inFlight.clear();
}

/**
 * Read-through fetch. Concurrent callers for the same key share one request so
 * a dashboard mounting six widgets does not fire six identical round trips.
 */
export async function readThrough(key, ttlSeconds, loader) {
  const cached = get(key);
  if (cached !== undefined) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const value = await loader();
      set(key, value, ttlSeconds);
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

/** Snapshot for the cache inspector on the admin screen. */
export function stats() {
  let live = 0;
  let expired = 0;
  for (const entry of store.values()) {
    if (isExpired(entry)) expired += 1;
    else live += 1;
  }
  return { live, expired, total: store.size, inFlight: inFlight.size };
}
