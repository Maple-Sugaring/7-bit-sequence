import { apiClient } from '../apiClient';
import { TTL } from '../cache/cacheKeys';
import { readThrough } from '../cache/queryCache';

/** Maintenance, installation, and calibration instructions. */

export function listGuides() {
  return readThrough('guides:all', TTL.USERS, () => apiClient.get('/guides'));
}
