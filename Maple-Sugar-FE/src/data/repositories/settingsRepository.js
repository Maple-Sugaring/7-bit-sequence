import { apiClient } from '../apiClient';

export function getSettings() {
  return apiClient.get('/settings');
}

export function updateReportInterval(minutes) {
  return apiClient.patch('/settings', { Report_Interval_Minutes: minutes });
}
