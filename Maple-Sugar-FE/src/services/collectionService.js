import * as collectionsRepository from '../data/repositories/collectionsRepository';
import { newClientRef } from '../data/clientRef';
import { enqueueCollection, flushCollectionQueue, queuedCollections } from '../data/offlineQueue';
import { loadRound, saveRound } from '../data/roundStore';

/**
 * Recording a collection (issue #28, FR-007).
 *
 * One entry is one request. The same body is what a signed-in phone posts and
 * what the offline queue replays, so both go through `toRequest`.
 */

/**
 * The API body for an entry. Entries queued by the old form carried a Title,
 * a Process_Notes, and a BucketID; those are read here so a phone that still
 * holds one when the update lands uploads it instead of stranding it.
 */
export function toRequest(entry) {
  return {
    NodeID: entry.NodeID,
    Weight: entry.Weight ?? null,
    // Null when the sap was not tested. Never a guess.
    Sugar_Percent: entry.Sugar_Percent ?? null,
    Ice_Present: Boolean(entry.Ice_Present),
    Collected_At: entry.Collected_At,
    Notes: (entry.Notes ?? entry.Process_Notes ?? '').trim(),
    Round_Label: entry.Round_Label?.trim() || null,
    Client_Ref: entry.Client_Ref ?? newClientRef(),
  };
}

export function recordCollection(entry) {
  return collectionsRepository.createCollection(toRequest(entry));
}

/** Parks an entry on the phone until the connection returns. Returns how many are waiting. */
export function queueCollection(entry) {
  return enqueueCollection(entry);
}

export function queuedCollectionCount() {
  return queuedCollections().length;
}

/** Uploads what is waiting on the phone. */
export function flushQueuedCollections() {
  return flushCollectionQueue(recordCollection);
}

/** The round in progress on this phone, if one is still fresh. */
export const loadActiveRound = () => loadRound();

export const saveActiveRound = (round) => saveRound(round);

/** A new reference for an entry, made once when the entry is saved. */
export const newEntryRef = newClientRef;
