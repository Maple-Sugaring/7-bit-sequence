import { apiClient } from '../apiClient';

export function listEntries() {
  return apiClient.get('/journal');
}

export function createEntry(entry) {
  return apiClient.post('/journal', entry);
}
