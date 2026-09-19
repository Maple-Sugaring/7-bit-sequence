import { apiClient } from '../apiClient';
import { cacheKeys, TTL } from '../cache/cacheKeys';
import { readThrough } from '../cache/queryCache';

/** Read access to the BUCKETS table. Tare weights feed the yield math. */

export function listBuckets() {
  return readThrough(cacheKeys.buckets(), TTL.BUCKETS, () => apiClient.get('/buckets'));
}
