import { apiClient } from '../apiClient';

export function getDaily({ year, nodeId } = {}) {
  return apiClient.get('/weather/daily', { year, nodeId });
}

export function getCompare(year) {
  return apiClient.get('/weather/compare', { year });
}

export function getLive() {
  return apiClient.get('/weather/live');
}
