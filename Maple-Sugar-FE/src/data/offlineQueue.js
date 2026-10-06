/**
 * Phone-side spool for collection entries made while the sugarbush has no signal.
 *
 * The entry stays in localStorage until a later visit can post it. Sensor
 * batches that miss Postgres are spooled on the API instead; this queue is for
 * the collection form a student fills out in the woods. Each entry carries the
 * Client_Ref it was saved under, so a replay the server already received is
 * answered with the stored entry rather than filed twice.
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

/** A rejection that retrying cannot fix: the server read the entry and refused it. */
function isRejection(error) {
  return error?.status === 400 || error?.status === 422;
}

/**
 * Posts each queued entry. Stops at the first network failure and leaves that
 * entry, and everything after it, on the phone.
 *
 * An entry the server refuses as invalid will be refused every time, so it is
 * taken off the queue and returned in `rejected` instead of waiting forever and
 * counting as an entry that is about to upload.
 */
export async function flushCollectionQueue(send, storage) {
  const items = read(storage);
  const remaining = [];
  const rejected = [];
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
      if (isRejection(error)) {
        rejected.push({ entry: item.entry, message: error.message });
        continue;
      }
      remaining.push(item);
      if (error?.isOffline || error?.code === 'NETWORK') stopped = true;
    }
  }

  write(storage, remaining);
  return { flushed, remaining: remaining.length, rejected };
}
