/**
 * Half-typed collection forms, kept per tree on the phone so nothing the
 * student typed is lost to switching trees, a refresh, a locked screen or a
 * walk to another page and back.
 */

const KEY = 'maple-collection-drafts';
const MAX_AGE_MS = 12 * 3_600_000;

function storageOr(storage) {
  if (storage) return storage;
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

/** Drafts by node id. Anything older than a round's lifetime is dropped. */
export function loadDrafts(storage, now = Date.now()) {
  const store = storageOr(storage);
  if (!store) return {};
  try {
    const parsed = JSON.parse(store.getItem(KEY) ?? '{}');
    const fresh = {};
    for (const [nodeId, draft] of Object.entries(parsed ?? {})) {
      if (draft && now - (draft.savedAt ?? 0) <= MAX_AGE_MS) fresh[nodeId] = draft;
    }
    return fresh;
  } catch {
    return {};
  }
}

export function saveDrafts(drafts, storage) {
  const store = storageOr(storage);
  if (!store) return;
  try {
    if (Object.keys(drafts).length) store.setItem(KEY, JSON.stringify(drafts));
    else store.removeItem(KEY);
  } catch {
    // Storage full or blocked: drafts still survive for this visit.
  }
}
