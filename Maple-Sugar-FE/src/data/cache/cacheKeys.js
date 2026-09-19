/**
 * Cache key scheme and TTLs, shared verbatim with the backend Redis layer.
 *
 * The frontend TTL cache and the server-side Redis cache must agree on these
 * strings, otherwise the two caches invalidate on different boundaries and a
 * write through one is invisible to the other. Change them here only.
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
