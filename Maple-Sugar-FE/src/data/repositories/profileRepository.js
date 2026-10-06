import { apiClient } from '../apiClient';

export function getProfile() {
  return apiClient.get('/profile');
}

export function updateProfile(changes) {
  return apiClient.patch('/profile', changes);
}
