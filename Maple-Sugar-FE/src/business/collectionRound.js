/**
 * A collection round (issue #28, FR-007).
 *
 * A round is one trip along the trees: the student empties each bucket in turn
 * and logs it. The round keeps a checklist of which trees are done, offers the
 * next one, and totals the trip at the end. Entering data tree after tree is
 * the common case, so everything here exists to make the next entry need as
 * few taps as possible.
 */

import { gallonsFromWeight, netWeight } from './yieldMetrics';

/**
 * A sensor weight older than this is not trusted to prefill the form. Matches
 * the 45 minutes the API and the device list use to call a node quiet.
 */
export const SENSOR_FRESH_MINUTES = 45;

/** A round left open longer than this belongs to yesterday and is not resumed. */
export const ROUND_MAX_AGE_HOURS = 12;

export function startRound({ label = '', now = new Date() } = {}) {
  return {
    id: `round-${now.getTime()}`,
    label,
    startedAt: now.toISOString(),
    entries: [],
  };
}

export function isRoundExpired(round, now = new Date()) {
  const started = new Date(round?.startedAt).getTime();
  if (!Number.isFinite(started)) return true;
  return now.getTime() - started > ROUND_MAX_AGE_HOURS * 3_600_000;
}

/**
 * The round with one more entry on it. The input round is left alone. The
 * round's clock starts at its first entry, so a page left open overnight does
 * not make a fresh round look old.
 */
export function addToRound(round, entry, now = new Date()) {
  return {
    ...round,
    startedAt: round.entries.length ? round.startedAt : now.toISOString(),
    entries: [...round.entries, entry],
  };
}

export function loggedNodeIds(round) {
  return new Set((round?.entries ?? []).map((entry) => entry.nodeId));
}

/**
 * The next tree still to do, in the order the list is shown, starting after
 * `afterNodeId` and wrapping around. Null once every tree is done.
 */
export function nextTreeToLog(trees, round, afterNodeId = null) {
  const list = trees ?? [];
  if (!list.length) return null;

  const done = loggedNodeIds(round);
  const start = list.findIndex((tree) => tree.nodeId === afterNodeId);
  for (let step = 1; step <= list.length; step += 1) {
    const tree = list[(start + step + list.length) % list.length];
    if (!done.has(tree.nodeId)) return tree;
  }
  return null;
}

/**
 * What the sensor can pre-fill for a tree. The weight is the latest one the
 * node reported, and only while the node is alive and recent; a stale number
 * would be saved as if the student had just weighed it.
 */
export function sensorDefaults(node, now = new Date()) {
  const none = { weight: null, ice: false, recordedAt: null, usable: false, reason: 'none' };
  if (!node || node.Weight == null) return none;

  const base = { weight: Number(node.Weight), ice: Boolean(node.Ice_Present), recordedAt: node.Recorded_At ?? null };
  if (node.Status_Code === 0) return { ...base, usable: false, reason: 'offline' };

  const age = (now.getTime() - new Date(node.Recorded_At).getTime()) / 60_000;
  if (!Number.isFinite(age) || age > SENSOR_FRESH_MINUTES) return { ...base, usable: false, reason: 'stale' };

  return { ...base, usable: true, reason: null };
}

/** Sap gallons for a gross weight, with the empty bucket taken off. */
export function sapGallonsFor(grossLb, tareLb = 0) {
  if (grossLb == null || grossLb === '') return null;
  return gallonsFromWeight(netWeight(Number(grossLb), tareLb ?? 0));
}

/** The totals for a round, from the entries as they were saved. */
export function summarizeRound(round) {
  const entries = round?.entries ?? [];
  const tested = entries.filter((entry) => entry.sugar != null);

  return {
    trees: entries.length,
    sapGallons: entries.reduce((sum, entry) => sum + (entry.sapGallons ?? 0), 0),
    syrupGallons: entries.reduce((sum, entry) => sum + (entry.syrupGallons ?? 0), 0),
    tested: tested.length,
    averageSugar: tested.length ? tested.reduce((sum, entry) => sum + entry.sugar, 0) / tested.length : null,
    waiting: entries.filter((entry) => entry.queued).length,
  };
}
