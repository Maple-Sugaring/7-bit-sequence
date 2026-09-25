import { apiClient } from '../apiClient';
import { cacheKeys, cacheNamespaces, hashFilters, TTL } from '../cache/cacheKeys';
import { invalidatePrefix, readThrough } from '../cache/queryCache';

/** Read/write access to the METRICS table. */

export function listMetrics(filters = {}) {
  const key = cacheKeys.metricsList(hashFilters(filters));
  return readThrough(key, TTL.METRICS, () => apiClient.get('/metrics', filters));
}

export function listMetricsForNode(nodeId, range = 'season') {
  const key = cacheKeys.metricsByNode(nodeId, range);
  return readThrough(key, TTL.METRICS, () => apiClient.get('/metrics', { nodeId }));
}

export async function createMetric(reading) {
  const created = await apiClient.post('/metrics', reading);
  invalidatePrefix(cacheNamespaces.METRICS);
  invalidatePrefix(cacheNamespaces.DASHBOARD);
  return created;
}

export async function updateMetric(metricId, changes) {
  const updated = await apiClient.patch(`/metrics/${metricId}`, changes);
  invalidatePrefix(cacheNamespaces.METRICS);
  invalidatePrefix(cacheNamespaces.DASHBOARD);
  return updated;
}
