import { apiClient } from '../apiClient';
import { cacheKeys, cacheNamespaces, TTL } from '../cache/cacheKeys';
import { invalidatePrefix, readThrough } from '../cache/queryCache';

/** Read/write access to the USERS and ROLES tables. */

export function listUsers() {
  return readThrough(cacheKeys.users(), TTL.USERS, () => apiClient.get('/users'));
}

export function listRoles() {
  return readThrough('roles:all', TTL.USERS, () => apiClient.get('/roles'));
}

export async function inviteUser(invite) {
  const created = await apiClient.post('/users/invite', invite);
  invalidatePrefix(cacheNamespaces.USERS);
  return created;
}

export async function updateUser(userId, changes) {
  const updated = await apiClient.patch(`/users/${userId}`, changes);
  invalidatePrefix(cacheNamespaces.USERS);
  return updated;
}

export async function removeUser(userId) {
  await apiClient.delete(`/users/${userId}`);
  invalidatePrefix(cacheNamespaces.USERS);
}
