/**
 * 2026 weight from the two Heltec nodes.
 *
 * Calendar year, not sap_season(). A September reading belongs to the next
 * sap season, and these packets are stamped in September 2026.
 */

import { BUCKET_CAPACITY_GALLONS, gallonsFromWeight, netWeight } from './yieldMetrics';

export const LIVE_YEAR = 2026;
export const LIVE_FROM = '2026-01-01T00:00:00.000Z';
export const LIVE_TO = '2026-12-31T23:59:59.999Z';
export const LIVE_NODE_IDS = [1, 2];

/** Sap in the bucket, after the empty-bucket weight, on a 0–10 gallon scale. */
export function bucketGallons(grossLb, tareLb = 0) {
  return gallonsFromWeight(netWeight(grossLb, tareLb));
}

export function bucketPercent(grossLb, tareLb = 0) {
  const gallons = bucketGallons(grossLb, tareLb);
  if (gallons == null) return 0;
  return Math.max(0, Math.min(100, (gallons / BUCKET_CAPACITY_GALLONS) * 100));
}

export function inLiveYear(iso, year = LIVE_YEAR) {
  const time = new Date(iso);
  return !Number.isNaN(time.getTime()) && time.getUTCFullYear() === year;
}

function nodeName(row) {
  return row.nodeName ?? row.Node_Name ?? `Node ${row.NodeID}`;
}

/** Hardware ingest leaves temperature empty. The seeded series always set one. */
export function isNodeReading(row) {
  return row?.Weight != null && row.Temperature == null && row.Recorded_By_UserID == null;
}

function stamp(iso, daily) {
  return daily ? String(iso).slice(0, 10) : iso;
}

/**
 * @param {'today' | '7d' | '30d' | '2026'} preset
 */
export function presetRange(preset, now = new Date()) {
  const end = new Date(now);
  if (preset === '2026') {
    return { from: new Date(LIVE_FROM), to: new Date(LIVE_TO) };
  }
  const start = new Date(end);
  start.setUTCHours(0, 0, 0, 0);
  if (preset === '7d') start.setUTCDate(start.getUTCDate() - 6);
  if (preset === '30d') start.setUTCDate(start.getUTCDate() - 29);
  return { from: start, to: end };
}

/**
 * Last weight each node reported on each UTC day. Sugar is ignored here;
 * a student records that at collection.
 */
export function dailyWeightRows(readings, { nodeIds = LIVE_NODE_IDS, year = LIVE_YEAR, daily = true } = {}) {
  const allowed = new Set(nodeIds);
  const latest = new Map();

  for (const row of readings ?? []) {
    if (!isNodeReading(row) || !inLiveYear(row.Recorded_At, year)) continue;
    if (!allowed.has(row.NodeID)) continue;
    const date = stamp(row.Recorded_At, daily);
    const key = daily ? `${row.NodeID}|${date}` : `${row.NodeID}|${row.Recorded_At}`;
    const previous = latest.get(key);
    if (previous && previous.at >= row.Recorded_At) continue;
    const tare = row.tareWeight ?? row.Tare_Weight ?? 0;
    latest.set(key, {
      date,
      nodeId: row.NodeID,
      name: nodeName(row),
      at: row.Recorded_At,
      weight: bucketGallons(row.Weight, tare),
    });
  }

  const byDate = new Map();
  const series = new Map();
  for (const point of latest.values()) {
    const row = byDate.get(point.date) ?? { Date: point.date };
    row[String(point.nodeId)] = point.weight;
    byDate.set(point.date, row);
    series.set(point.nodeId, { key: String(point.nodeId), name: point.name });
  }

  return {
    rows: [...byDate.values()].sort((a, b) => a.Date.localeCompare(b.Date)),
    series: [...series.values()],
  };
}

/** Sugar percents a person recorded. Sensor rows with a null percent are skipped. */
export function recordedSugar(entries, year = LIVE_YEAR) {
  return (entries ?? [])
    .filter((row) => row.Sugar_Percent != null && inLiveYear(row.Recorded_At ?? row.Collected_At, year))
    .map((row) => Number(row.Sugar_Percent));
}
