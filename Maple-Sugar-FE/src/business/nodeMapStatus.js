/**
 * One definition of "what state is this node in" for the fleet map, so the map,
 * its legend and the list can never disagree (EIR-004).
 */

/** A node that has not reported in this long is stale. Mirrors the backend. */
export const STALE_AFTER_MINUTES = 45;

export const MapStatus = {
  ONLINE: 'online',
  STALE: 'stale',
  DEGRADED: 'degraded',
  MAINTENANCE: 'maintenance',
  OFFLINE: 'offline',
};

/** Most urgent first; the list sorts by this. */
export const STATUS_ORDER = [
  MapStatus.DEGRADED,
  MapStatus.STALE,
  MapStatus.OFFLINE,
  MapStatus.MAINTENANCE,
  MapStatus.ONLINE,
];

/**
 * The one place a node status gets its words, colour and shape. Labels and
 * colours match what the Dashboard, Node and Deploy pages always showed for
 * status codes 0-3; `stale` is the one status they did not have. Colour is a
 * MUI palette key and is never the only cue, so each status has its own shape.
 */
export const STATUS_META = {
  [MapStatus.ONLINE]: { label: 'Online', color: 'success', shape: 'circle' },
  [MapStatus.STALE]: { label: 'Stale', color: 'default', shape: 'ring' },
  [MapStatus.DEGRADED]: { label: 'Degraded', color: 'warning', shape: 'triangle' },
  [MapStatus.MAINTENANCE]: { label: 'Maintenance', color: 'info', shape: 'square' },
  [MapStatus.OFFLINE]: { label: 'Offline', color: 'error', shape: 'slash' },
};

/** For screens that only have the raw status code (0 offline .. 3 maintenance). */
export function statusFromCode(code) {
  return (
    { 0: MapStatus.OFFLINE, 1: MapStatus.ONLINE, 2: MapStatus.DEGRADED, 3: MapStatus.MAINTENANCE }[code] ??
    MapStatus.ONLINE
  );
}

/** Open alerts of these types mean the hardware itself is in trouble. */
export const FAULT_ALERT_TYPES = ['Tipped', 'Spill'];

const STATUS_OFFLINE = 0;
const STATUS_DEGRADED = 2;
const STATUS_MAINTENANCE = 3;

export function validCoordinates(location) {
  if (!location) return false;
  const { lat, lon } = location;
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  // 0,0 is what an unsited device reports, not a place in the sugarbush.
  return !(lat === 0 && lon === 0);
}

export function deriveMapStatus(node, { now = new Date(), faultNodeIds = new Set() } = {}) {
  if (node.Last_Seen == null || node.Status_Code === STATUS_OFFLINE) return MapStatus.OFFLINE;
  if (node.Status_Code === STATUS_MAINTENANCE) return MapStatus.MAINTENANCE;
  if (node.Status_Code === STATUS_DEGRADED || faultNodeIds.has(node.NodeID)) return MapStatus.DEGRADED;
  const minutes = (new Date(now).getTime() - new Date(node.Last_Seen).getTime()) / 60000;
  return minutes > STALE_AFTER_MINUTES ? MapStatus.STALE : MapStatus.ONLINE;
}

function openFaultAlerts(alerts) {
  return alerts.filter((alert) => !alert.Is_Resolved && FAULT_ALERT_TYPES.includes(alert.Alert_Type));
}

/**
 * Status per node id, for screens that list nodes but are not the map. Uses the
 * same rules as the map (offline, maintenance, degraded, stale, online) so a
 * node reads the same wherever it appears.
 */
export function statusByNodeId(nodes = [], alerts = [], now = new Date()) {
  const faultNodeIds = new Set(openFaultAlerts(alerts).map((alert) => alert.NodeID));
  return new Map(nodes.map((node) => [node.NodeID, deriveMapStatus(node, { now, faultNodeIds })]));
}

/** Why a node reads as degraded, for the popup. Null when it is not. */
function faultReasonFor(node, alertTexts) {
  const parts = [];
  if (node.Status_Code === STATUS_DEGRADED) parts.push('Reporting as degraded');
  parts.push(...(alertTexts.get(node.NodeID) ?? []));
  return parts.length ? parts.join('; ') : null;
}

/** Nodes with the status, latest reading and siting the map needs. */
export function buildFleetNodes({ nodes = [], board = [], alerts = [], now = new Date() }) {
  const faultAlerts = openFaultAlerts(alerts);
  const faultNodeIds = new Set(faultAlerts.map((alert) => alert.NodeID));
  const alertTexts = new Map();
  faultAlerts.forEach((alert) => {
    const list = alertTexts.get(alert.NodeID) ?? [];
    list.push(alert.Description || alert.Alert_Type);
    alertTexts.set(alert.NodeID, list);
  });
  const readingByNode = new Map(board.map((row) => [row.NodeID, row]));
  return nodes.map((node) => {
    const mapStatus = deriveMapStatus(node, { now, faultNodeIds });
    return {
      ...node,
      mapStatus,
      // Recomputed from the same clock as the status, so "seen 50 min ago"
      // can never sit beside a Fresh badge.
      minutesSinceSeen:
        node.Last_Seen == null ? null : Math.floor((new Date(now) - new Date(node.Last_Seen)) / 60000),
      faultReason: mapStatus === MapStatus.DEGRADED ? faultReasonFor(node, alertTexts) : null,
      reading: readingByNode.get(node.NodeID) ?? null,
      hasLocation: validCoordinates(node.Location),
    };
  });
}

export function statusCounts(rows) {
  const counts = Object.fromEntries(Object.values(MapStatus).map((status) => [status, 0]));
  rows.forEach((row) => {
    counts[row.mapStatus] += 1;
  });
  return counts;
}

/** Nodes at the same point (to ~1 m) share one marker and one popup. */
export function groupByLocation(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    if (!validCoordinates(row.Location)) return;
    const key = `${row.Location.lat.toFixed(5)},${row.Location.lon.toFixed(5)}`;
    if (!groups.has(key)) groups.set(key, { key, position: [row.Location.lat, row.Location.lon], nodes: [] });
    groups.get(key).nodes.push(row);
  });
  return [...groups.values()];
}

export function worstStatus(rows) {
  return STATUS_ORDER.find((status) => rows.some((row) => row.mapStatus === status)) ?? MapStatus.ONLINE;
}

/**
 * Load state for the three sources the map reads. Nodes can render once the
 * node list is in, but if any source failed the map may be missing faults or
 * readings, so it is flagged `stale` rather than shown as healthy.
 */
export function fleetLoadState({ nodes, board, alerts, error }) {
  const settled = nodes != null && board != null && alerts != null;
  return {
    loading: !settled && !error,
    stale: Boolean(error) && nodes != null,
  };
}
