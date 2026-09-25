import { apiClient } from '../apiClient';
import { cacheKeys, cacheNamespaces, TTL } from '../cache/cacheKeys';
import { invalidatePrefix, readThrough } from '../cache/queryCache';

/** Read/write access to the COLLECTION_LOGS table. */

export function listCollectionLogs(season) {
  return readThrough(cacheKeys.collectionLogs(season ?? 'all'), TTL.COLLECTION_LOGS, () =>
    apiClient.get('/collection-logs', season ? { season } : undefined),
  );
}

export async function createCollectionLog(entry) {
  const created = await apiClient.post('/collection-logs', entry);
  invalidatePrefix(cacheNamespaces.COLLECTION_LOGS);
  invalidatePrefix(cacheNamespaces.DASHBOARD);
  return created;
}
