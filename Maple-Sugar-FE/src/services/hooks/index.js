import { useCallback } from 'react';
import * as adminService from '../adminService';
import * as alertService from '../alertService';
import * as dashboardService from '../dashboardService';
import * as guideService from '../guideService';
import * as metricsService from '../metricsService';
import * as nodeService from '../nodeService';
import * as scheduleService from '../scheduleService';
import { useAction, useAsync } from './useAsync';

/**
 * The only surface pages are allowed to import from the service layer.
 * Keeping the hooks here means a page never reaches past its own layer.
 */

export { useAction, useAsync };

export function useDashboard(season) {
  return useAsync(useCallback(() => dashboardService.getDashboard({ season }), [season]));
}

export function useReadings({ season, nodeId, from, to } = {}) {
  return useAsync(
    useCallback(
      () => metricsService.getReadings({ season, nodeId, from, to }),
      [season, nodeId, from, to],
    ),
    { initialData: [] },
  );
}

export function useRecordingTargets() {
  return useAsync(useCallback(() => metricsService.getRecordingTargets(), []), {
    initialData: [],
  });
}

export function useSubmitReading() {
  return useAction(useCallback((reading) => metricsService.submitReading(reading), []));
}

export function useAlerts() {
  return useAsync(useCallback(() => alertService.getAlerts(), []), { initialData: [] });
}

export function useOpenAlertCount() {
  return useAsync(useCallback(() => alertService.getOpenAlertCount(), []), { initialData: 0 });
}

export function useDeviceHealth() {
  return useAsync(useCallback(() => nodeService.getDeviceHealth(), []));
}

export function useSchedule({ userId } = {}) {
  return useAsync(useCallback(() => scheduleService.getSchedule({ userId }), [userId]));
}

export function useUsers() {
  return useAsync(useCallback(() => adminService.getUsers(), []));
}

export function useGuides() {
  return useAsync(useCallback(() => guideService.getGuides(), []));
}
