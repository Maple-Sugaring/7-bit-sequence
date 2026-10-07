import { apiClient } from '../apiClient';
import { cacheNamespaces } from '../cache/cacheKeys';
import { invalidatePrefix } from '../cache/queryCache';

/**
 * One collection from the round form. The API writes the reading, the
 * collection log, and the journal entry together, so everything that reads any
 * of them is stale afterward.
 */
export async function createCollection(body) {
  const result = await apiClient.post('/collections', body);
  invalidatePrefix(cacheNamespaces.METRICS);
  invalidatePrefix(cacheNamespaces.COLLECTION_LOGS);
  invalidatePrefix(cacheNamespaces.DASHBOARD);
  invalidatePrefix(cacheNamespaces.NODES);
  invalidatePrefix(cacheNamespaces.ALERTS);
  return result;
}
