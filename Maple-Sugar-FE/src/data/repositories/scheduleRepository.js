import { apiClient } from '../apiClient';
import { cacheKeys, cacheNamespaces, TTL } from '../cache/cacheKeys';
import { invalidatePrefix, readThrough } from '../cache/queryCache';

/** Read/write access to shift slots. */

export function listSlots({ from, to } = {}) {
  return readThrough(cacheKeys.scheduleSlots(from ?? 'any', to ?? 'any'), TTL.SCHEDULE, () =>
    apiClient.get('/schedule/slots', { from, to }),
  );
}

export async function createSlot(slot) {
  const created = await apiClient.post('/schedule/slots', slot);
  invalidatePrefix(cacheNamespaces.SCHEDULE);
  return created;
}

export async function updateSlot(slotId, changes) {
  const updated = await apiClient.patch(`/schedule/slots/${slotId}`, changes);
  invalidatePrefix(cacheNamespaces.SCHEDULE);
  return updated;
}

export async function deleteSlot(slotId) {
  await apiClient.delete(`/schedule/slots/${slotId}`);
  invalidatePrefix(cacheNamespaces.SCHEDULE);
}

export function getAvailability() {
  return apiClient.get('/schedule/availability');
}

export async function claimTime(slotId, window) {
  const updated = await apiClient.post(`/schedule/slots/${slotId}/claim-time`, {
    Starts_At: window.Starts_At,
    Ends_At: window.Ends_At,
  });
  invalidatePrefix(cacheNamespaces.SCHEDULE);
  return updated;
}

export async function signUpForSlot(slotId, userId) {
  const updated = await apiClient.post(`/schedule/slots/${slotId}/signup`, { userId });
  invalidatePrefix(cacheNamespaces.SCHEDULE);
  return updated;
}

export async function withdrawFromSlot(slotId, userId) {
  const updated = await apiClient.post(`/schedule/slots/${slotId}/withdraw`, { userId });
  invalidatePrefix(cacheNamespaces.SCHEDULE);
  return updated;
}
