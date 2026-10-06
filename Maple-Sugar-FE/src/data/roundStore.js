import { isRoundExpired } from '../business/collectionRound';

/**
 * The round in progress, kept on the phone so a refresh, a locked screen, or a
 * walk out of signal does not lose the checklist of trees already done.
 */

const KEY = 'maple-collection-round';

function storageOr(storage) {
  if (storage) return storage;
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

/** The saved round, or null when there is none or it is too old to resume. */
export function loadRound(storage, now = new Date()) {
  const store = storageOr(storage);
  if (!store) return null;
  try {
    const round = JSON.parse(store.getItem(KEY) ?? 'null');
    if (!round || !Array.isArray(round.entries)) return null;
    return isRoundExpired(round, now) ? null : round;
  } catch {
    return null;
  }
}

export function saveRound(round, storage) {
  const store = storageOr(storage);
  if (!store) return;
  try {
    if (round) store.setItem(KEY, JSON.stringify(round));
    else store.removeItem(KEY);
  } catch {
    // Storage full or blocked: the round still works for this visit.
  }
}
