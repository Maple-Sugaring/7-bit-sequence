import { apiClient } from '../apiClient';
import { cacheKeys, cacheNamespaces, TTL } from '../cache/cacheKeys';
import { invalidatePrefix, readThrough } from '../cache/queryCache';

/** Read/write access to the NODE and GATEWAY tables. */

export function listNodes() {
  return readThrough(cacheKeys.nodesHealth(), TTL.NODE_HEALTH, () => apiClient.get('/nodes'));
}

export function getNode(nodeId) {
  return readThrough(cacheKeys.node(nodeId), TTL.NODE_HEALTH, () =>
    apiClient.get(`/nodes/${nodeId}`),
  );
}

export function listGateways() {
  return readThrough(cacheKeys.gateways(), TTL.NODE_HEALTH, () => apiClient.get('/gateways'));
}

export async function updateNode(nodeId, changes) {
  const updated = await apiClient.patch(`/nodes/${nodeId}`, changes);
  invalidatePrefix(cacheNamespaces.NODES);
  return updated;
}

export async function flagNode(nodeId, { type, description }) {
  const alert = await apiClient.post(`/nodes/${nodeId}/flag`, { type, description });
  invalidatePrefix(cacheNamespaces.ALERTS);
  invalidatePrefix(cacheNamespaces.NODES);
  return alert;
}
