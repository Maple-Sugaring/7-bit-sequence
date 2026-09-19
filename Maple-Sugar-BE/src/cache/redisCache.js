/**
 * Redis-backed read-through cache.
 *
 * Every operation degrades to a miss rather than an error: if Redis is down or
 * was never configured, `readThrough` still calls the loader and the API keeps
 * serving from Postgres. A cache outage should be a latency problem, never an
 * availability one.
 */

import { createClient } from 'redis';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

const KEY_PREFIX = 'maple:';

let client = null;
let available = false;
/** Logged once per outage rather than once per request. */
let outageLogged = false;

export async function connectCache() {
  if (!config.redisUrl) {
    logger.warn('REDIS_URL is not set; running without a cache');
    return null;
  }

  client = createClient({
    url: config.redisUrl,
    socket: {
      // Give up escalating quickly: the point is to keep retrying quietly in
      // the background, not to stall requests waiting on a dead server.
      reconnectStrategy: (retries) => Math.min(retries * 200, 5_000),
      connectTimeout: 3_000,
    },
  });

  client.on('error', (error) => {
    available = false;
    if (!outageLogged) {
      logger.error({ err: error }, 'Redis unavailable; serving directly from Postgres');
      outageLogged = true;
    }
  });

  client.on('ready', () => {
    available = true;
    outageLogged = false;
    logger.info('Redis connected');
  });

  try {
    await client.connect();
  } catch (error) {
    logger.error({ err: error }, 'Redis connection failed; continuing without a cache');
  }

  return client;
}

export async function disconnectCache() {
  if (client?.isOpen) await client.quit();
  client = null;
  available = false;
}

const usable = () => Boolean(client) && available;

export async function get(key) {
  if (!usable()) return undefined;
  try {
    const raw = await client.get(KEY_PREFIX + key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch (error) {
    logger.debug({ err: error, key }, 'Cache read failed');
    return undefined;
  }
}

export async function set(key, value, ttlSeconds) {
  if (!usable()) return;
  try {
    const payload = JSON.stringify(value);
    if (ttlSeconds > 0) {
      await client.set(KEY_PREFIX + key, payload, { EX: ttlSeconds });
    } else {
      await client.set(KEY_PREFIX + key, payload);
    }
  } catch (error) {
    logger.debug({ err: error, key }, 'Cache write failed');
  }
}

export async function del(key) {
  if (!usable()) return;
  try {
    await client.del(KEY_PREFIX + key);
  } catch (error) {
    logger.debug({ err: error, key }, 'Cache delete failed');
  }
}

/**
 * Deletes every key under a namespace prefix, e.g. `metrics:`.
 *
 * Uses SCAN rather than KEYS so a large keyspace does not block the Redis
 * event loop, and unlinks in batches so one write does not fan out into
 * thousands of round trips.
 */
export async function invalidatePrefix(prefix) {
  if (!usable()) return 0;

  let removed = 0;
  try {
    const batch = [];
    for await (const key of client.scanIterator({
      MATCH: `${KEY_PREFIX}${prefix}*`,
      COUNT: 250,
    })) {
      batch.push(key);
      if (batch.length >= 250) {
        await client.unlink(batch.splice(0));
        removed += 250;
      }
    }
    if (batch.length) {
      await client.unlink(batch);
      removed += batch.length;
    }
  } catch (error) {
    logger.debug({ err: error, prefix }, 'Cache invalidation failed');
  }

  return removed;
}

/** Invalidates several namespaces after a write. */
export async function invalidateNamespaces(prefixes) {
  await Promise.all(prefixes.map((prefix) => invalidatePrefix(prefix)));
}

/**
 * Returns the cached value for `key`, or calls `loader`, caches, and returns.
 *
 * `undefined` from the loader is not cached, so a lookup that legitimately has
 * no answer is retried rather than pinned as a negative result for the TTL.
 */
export async function readThrough(key, ttlSeconds, loader) {
  const hit = await get(key);
  if (hit !== undefined) return hit;

  const value = await loader();
  if (value !== undefined) await set(key, value, ttlSeconds);
  return value;
}

export function cacheStatus() {
  return {
    configured: Boolean(config.redisUrl),
    connected: usable(),
  };
}
