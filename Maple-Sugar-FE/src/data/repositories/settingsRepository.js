import { apiClient } from '../apiClient';

export function getSettings() {
  return apiClient.get('/settings');
}

export function updateReportInterval(seconds) {
  return apiClient.patch('/settings', { Report_Interval_Seconds: seconds });
}
