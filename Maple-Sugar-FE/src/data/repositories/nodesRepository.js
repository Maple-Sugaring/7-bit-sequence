import { apiClient } from '../apiClient';
import { cacheKeys, cacheNamespaces, TTL } from '../cache/cacheKeys';
import { invalidatePrefix, readThrough } from '../cache/queryCache';

/** Read/write access to the NODE and GATEWAY tables. */

export function listBoard() {
  return apiClient.get('/nodes/board');
}

export async function runNodeAction(nodeId, body) {
  const result = await apiClient.post(`/nodes/${nodeId}/actions`, body);
  invalidatePrefix(cacheNamespaces.NODES);
  invalidatePrefix(cacheNamespaces.ALERTS);
  invalidatePrefix(cacheNamespaces.METRICS);
  return result;
}

export function listNodes() {
  return readThrough(cacheKeys.nodesHealth(), TTL.NODE_HEALTH, () => apiClient.get('/nodes'));
}

export function getNode(nodeId) {
  return readThrough(cacheKeys.node(nodeId), TTL.NODE_HEALTH, () =>
    apiClient.get(`/nodes/${nodeId}`),
  );
}

export async function createGateway(body) {
  const gateway = await apiClient.post('/gateways', body);
  invalidatePrefix(cacheNamespaces.GATEWAYS);
  return gateway;
}

export async function updateGateway(gatewayId, body) {
  const gateway = await apiClient.patch(`/gateways/${gatewayId}`, body);
  // Node rows carry the gateway's label, so both caches go stale.
  invalidatePrefix(cacheNamespaces.GATEWAYS);
  invalidatePrefix(cacheNamespaces.NODES);
  return gateway;
}

export async function deleteGateway(gatewayId) {
  await apiClient.delete(`/gateways/${gatewayId}`);
  invalidatePrefix(cacheNamespaces.GATEWAYS);
  invalidatePrefix(cacheNamespaces.NODES);
}

export function listGateways() {
  return readThrough(cacheKeys.gateways(), TTL.NODE_HEALTH, () => apiClient.get('/gateways'));
}

export async function updateNode(nodeId, changes) {
  const updated = await apiClient.patch(`/nodes/${nodeId}`, changes);
  invalidatePrefix(cacheNamespaces.NODES);
  return updated;
}

export async function createNode(body) {
  const node = await apiClient.post('/nodes', body);
  invalidatePrefix(cacheNamespaces.NODES);
  return node;
}

export async function deleteNode(nodeId) {
  await apiClient.delete(`/nodes/${nodeId}`);
  invalidatePrefix(cacheNamespaces.NODES);
  invalidatePrefix(cacheNamespaces.METRICS);
  invalidatePrefix(cacheNamespaces.ALERTS);
}

export async function updateNodeDetails(nodeId, body) {
  const updated = await apiClient.patch(`/nodes/${nodeId}/details`, body);
  invalidatePrefix(cacheNamespaces.NODES);
  return updated;
}

export async function setReportInterval(nodeId, minutes) {
  const updated = await apiClient.patch(`/nodes/${nodeId}/interval`, {
    Report_Interval_Minutes: minutes,
  });
  invalidatePrefix(cacheNamespaces.NODES);
  return updated;
}

export async function flagNode(nodeId, { type, description }) {
  const alert = await apiClient.post(`/nodes/${nodeId}/flag`, { type, description });
  invalidatePrefix(cacheNamespaces.ALERTS);
  invalidatePrefix(cacheNamespaces.NODES);
  return alert;
}
