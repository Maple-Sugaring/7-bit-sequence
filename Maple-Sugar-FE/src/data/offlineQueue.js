/**
 * Phone-side spool for collection entries made while the sugarbush has no signal.
 *
 * The entry stays in localStorage until a later visit can post it. Sensor
 * batches that miss Postgres are spooled on the API instead; this queue is for
 * the collection form a student fills out in the woods.
 */

const KEY = 'maple-collection-queue';

function storageOr(storage) {
  if (storage) return storage;
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function read(storage) {
  const store = storageOr(storage);
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(storage, items) {
  const store = storageOr(storage);
  if (!store) return;
  store.setItem(KEY, JSON.stringify(items));
}

export function queuedCollections(storage) {
  return read(storage);
}

export function enqueueCollection(entry, storage) {
  const items = read(storage);
  items.push({ id: `${Date.now()}-${items.length}`, entry });
  write(storage, items);
  return items.length;
}

/**
 * Posts each queued entry. Stops at the first network failure and leaves that
 * entry, and everything after it, on the phone.
 */
export async function flushCollectionQueue(send, storage) {
  const items = read(storage);
  const remaining = [];
  let flushed = 0;
  let stopped = false;

  for (const item of items) {
    if (stopped) {
      remaining.push(item);
      continue;
    }
    try {
      await send(item.entry);
      flushed += 1;
    } catch (error) {
      remaining.push(item);
      if (error?.isOffline || error?.code === 'NETWORK') stopped = true;
    }
  }

  write(storage, remaining);
  return { flushed, remaining: remaining.length };
}
