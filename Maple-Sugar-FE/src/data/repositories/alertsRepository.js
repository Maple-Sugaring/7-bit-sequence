import { apiClient } from '../apiClient';
import { cacheKeys, cacheNamespaces, TTL } from '../cache/cacheKeys';
import { invalidatePrefix, readThrough } from '../cache/queryCache';

/** Read/write access to the ALERTS table. */

export function listAlerts() {
  return readThrough(cacheKeys.alertsAll(), TTL.ALERTS, () => apiClient.get('/alerts'));
}

export function listOpenAlerts() {
  return readThrough(cacheKeys.alertsOpen(), TTL.ALERTS, () =>
    apiClient.get('/alerts', { resolved: 'false' }),
  );
}

export async function setAlertResolved(alertId, isResolved) {
  const updated = await apiClient.patch(`/alerts/${alertId}`, { Is_Resolved: isResolved });
  invalidatePrefix(cacheNamespaces.ALERTS);
  return updated;
}
