import { apiClient } from '../apiClient';

export function sendTestEmail() {
  return apiClient.post('/notifications/test');
}
