/**
 * Cache key scheme and TTLs, mirroring src/data/cache/cacheKeys.js in the
 * frontend byte for byte.
 *
 * The two caches must agree on these strings. If they drift, a write that
 * invalidates one tier leaves the other serving stale rows, which surfaces as
 * a value that changes when you reload but not when you navigate. Change them
 * in both places or neither.
 */

export const TTL = {
  /** Raw sensor reads land every few seconds; a short window still cuts most refetches. */
  METRICS: 60,
  /** Aggregated season rollups are expensive and change slowly. */
  DASHBOARD: 300,
  /** Battery and last-seen need to look live on the device health screen. */
  NODE_HEALTH: 30,
  /** Unresolved alerts drive the notification badge. */
  ALERTS: 30,
  /** Roster and roles change only on admin action. */
  USERS: 600,
  /** Shift slots change on signup, which we invalidate explicitly. */
  SCHEDULE: 120,
  /** Bucket inventory and tare weights are near-static. */
  BUCKETS: 600,
  COLLECTION_LOGS: 120,
};

export const cacheKeys = {
  metricsByNode: (nodeId, range) => `metrics:node:${nodeId}:${range}`,
  metricsList: (filterHash) => `metrics:list:${filterHash}`,
  dashboardSummary: (season) => `dashboard:summary:${season}`,
  dashboardSeries: (season, metric) => `dashboard:series:${season}:${metric}`,
  seasonComparison: (seasons) => `dashboard:yoy:${seasons.join('-')}`,
  nodesHealth: () => 'nodes:health',
  node: (nodeId) => `nodes:${nodeId}`,
  gateways: () => 'gateways:all',
  buckets: () => 'buckets:all',
  alertsOpen: () => 'alerts:open',
  alertsAll: () => 'alerts:all',
  users: () => 'users:all',
  roles: () => 'roles:all',
  guides: () => 'guides:all',
  scheduleSlots: (from, to) => `schedule:slots:${from}:${to}`,
  collectionLogs: (season) => `collection_logs:season:${season}`,
};

/** Prefixes used for bulk invalidation after a write. */
export const cacheNamespaces = {
  METRICS: 'metrics:',
  DASHBOARD: 'dashboard:',
  NODES: 'nodes:',
  ALERTS: 'alerts:',
  USERS: 'users:',
  SCHEDULE: 'schedule:',
  BUCKETS: 'buckets:',
  COLLECTION_LOGS: 'collection_logs:',
};

/** Stable key fragment for an arbitrary filter object. */
export function hashFilters(filters = {}) {
  const entries = Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);

  return entries.length ? entries.join('|') : 'all';
}
