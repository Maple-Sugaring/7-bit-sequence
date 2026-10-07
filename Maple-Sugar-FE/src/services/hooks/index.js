import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildFleetNodes, fleetLoadState, statusByNodeId } from '../../business/nodeMapStatus';
import * as adminService from '../adminService';
import * as alertService from '../alertService';
import * as collectionService from '../collectionService';
import * as dashboardService from '../dashboardService';
import * as guideService from '../guideService';
import * as metricsService from '../metricsService';
import * as nodeService from '../nodeService';
import * as journalService from '../journalService';
import * as notificationService from '../notificationService';
import * as profileService from '../profileService';
import * as scheduleService from '../scheduleService';
import * as settingsService from '../settingsService';
import * as weatherService from '../weatherService';
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

export function useRecordCollection() {
  return useAction(collectionService.recordCollection);
}

/** What a collection keeps on the phone: the offline queue and the round in progress. */
export const collectionLocal = {
  addToQueue: collectionService.queueCollection,
  queuedCount: collectionService.queuedCollectionCount,
  flushQueue: collectionService.flushQueuedCollections,
  loadRound: collectionService.loadActiveRound,
  saveRound: collectionService.saveActiveRound,
  newRef: collectionService.newEntryRef,
};

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

export function useAvailability(enabled) {
  return useAsync(useCallback(() => scheduleService.getAvailability(), []), {
    enabled,
    initialData: null,
  });
}

export function useDailyWeather(year) {
  return useAsync(useCallback(() => weatherService.getDailySeries({ year }), [year]), {
    initialData: { Days: [] },
  });
}

export function useLiveWeather() {
  return useAsync(useCallback(() => weatherService.getLiveWeather(), []), { initialData: null });
}

export function useSapCompare(year) {
  return useAsync(useCallback(() => weatherService.getCompare(year), [year]), {
    initialData: { Nodes: [] },
  });
}

export function useGateways() {
  return useAsync(useCallback(() => nodeService.listGateways(), []), { initialData: [] });
}

export function useNodes() {
  return useAsync(useCallback(() => nodeService.listNodes(), []), { initialData: [] });
}

export function useBush() {
  return useAsync(useCallback(() => nodeService.getBoard(), []), { initialData: [] });
}

export function useJournal() {
  return useAsync(useCallback(() => journalService.getJournal(), []), { initialData: [] });
}

export function useSettings() {
  return useAsync(useCallback(() => settingsService.getSettings(), []), { initialData: null });
}

export function useProfile() {
  return useAsync(useCallback(() => profileService.getProfile(), []));
}

export function useSaveProfile() {
  return useAction(profileService.saveProfile);
}

export function useSendTestEmail() {
  return useAction(notificationService.sendTestEmail);
}

export function useUsers() {
  return useAsync(useCallback(() => adminService.getUsers(), []));
}

export function useGuides() {
  return useAsync(useCallback(() => guideService.getGuides(), []));
}

const FLEET_REFRESH_MS = 60_000;

// Stable identities: useAsync refetches when its loader changes.
const loadBoard = () => nodeService.getBoard();
const loadAlerts = () => alertService.getAlerts();

/** useAsync nulls its data when a refetch fails; keep the last good value instead. */
function useLastGood(value) {
  const [kept, setKept] = useState(value);
  if (value != null && value !== kept) setKept(value);
  return value ?? kept;
}

/**
 * Every deployed node with its map status. The board rows already carry
 * siting, last-seen, health and the latest reading, so the map needs only the
 * board and the alerts; the Dashboard shares this one fetch. Refreshes on a
 * timer and when the tab regains focus. A failed refresh keeps the last good
 * data and reports `error` alongside it.
 */
export function useFleetMap() {
  const board = useAsync(loadBoard);
  const alerts = useAsync(loadAlerts);
  const boardData = useLastGood(board.data);
  const alertData = useLastGood(alerts.data);
  const [now, setNow] = useState(() => new Date());
  const { refresh: refreshBoard } = board;
  const { refresh: refreshAlerts } = alerts;

  const refresh = useCallback(() => {
    setNow(new Date());
    refreshBoard();
    refreshAlerts();
  }, [refreshBoard, refreshAlerts]);

  useEffect(() => {
    const timer = setInterval(refresh, FLEET_REFRESH_MS);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  const nodes = useMemo(
    () => buildFleetNodes({ nodes: boardData ?? [], board: boardData ?? [], alerts: alertData ?? [], now }),
    [boardData, alertData, now],
  );

  const error = board.error ?? alerts.error;
  const { loading, stale } = fleetLoadState({ nodes: boardData, alerts: alertData, error });

  return { nodes, loading, error, stale, refresh };
}

/**
 * Status per node id for a page that lists nodes (Dashboard, Node, Deploy), on
 * the same rules as the map. Alerts decide degraded-by-fault; until they load,
 * a node falls back to what its own fields say.
 */
export function useNodeStatuses(nodes) {
  const alerts = useAlerts();
  return useMemo(
    () => statusByNodeId(nodes ?? [], alerts.data ?? []),
    [nodes, alerts.data],
  );
}
