import { describe, expect, it } from 'vitest';
import {
  buildFleetNodes,
  deriveMapStatus,
  fleetLoadState,
  groupByLocation,
  MapStatus,
  statusCounts,
  statusFromCode,
  validCoordinates,
} from '../src/business/nodeMapStatus';

const node = (overrides = {}) => ({
  NodeID: 1,
  Node_Name: 'Tree 1',
  Stand: 'North',
  Status_Code: 1,
  Last_Seen: '2026-03-01T12:00:00Z',
  Location: { lat: 43.084, lon: -77.68 },
  ...overrides,
});
const NOW = new Date('2026-03-01T12:10:00Z');

describe('validCoordinates', () => {
  it.each([
    [{ lat: 43.084, lon: -77.68 }, true],
    [null, false],
    [undefined, false],
    [{ lat: 0, lon: 0 }, false],
    [{ lat: 91, lon: 10 }, false],
    [{ lat: 10, lon: 181 }, false],
    [{ lat: 'x', lon: 10 }, false],
    [{ lat: NaN, lon: 10 }, false],
    [{ lat: null, lon: 10 }, false],
  ])('%j -> %s', (location, ok) => {
    expect(validCoordinates(location)).toBe(ok);
  });
});

describe('deriveMapStatus', () => {
  it('is online for an online node seen recently', () => {
    expect(deriveMapStatus(node(), { now: NOW })).toBe(MapStatus.ONLINE);
  });
  it('is stale after 45 minutes without a report', () => {
    const seen = '2026-03-01T11:00:00Z';
    expect(deriveMapStatus(node({ Last_Seen: seen }), { now: NOW })).toBe(MapStatus.STALE);
  });
  it('is offline with no last_seen, not stale', () => {
    expect(deriveMapStatus(node({ Last_Seen: null }), { now: NOW })).toBe(MapStatus.OFFLINE);
  });
  it('is offline when status code is 0', () => {
    expect(deriveMapStatus(node({ Status_Code: 0 }), { now: NOW })).toBe(MapStatus.OFFLINE);
  });
  it('is degraded for degraded status even if recently seen', () => {
    expect(deriveMapStatus(node({ Status_Code: 2 }), { now: NOW })).toBe(MapStatus.DEGRADED);
  });
  it('is degraded when the node has an open fault alert', () => {
    expect(deriveMapStatus(node(), { now: NOW, faultNodeIds: new Set([1]) })).toBe(MapStatus.DEGRADED);
  });
  it('maintenance wins over fault and stale', () => {
    const n = node({ Status_Code: 3, Last_Seen: '2026-03-01T01:00:00Z' });
    expect(deriveMapStatus(n, { now: NOW, faultNodeIds: new Set([1]) })).toBe(MapStatus.MAINTENANCE);
  });
  it('degraded wins over stale', () => {
    const n = node({ Status_Code: 2, Last_Seen: '2026-03-01T01:00:00Z' });
    expect(deriveMapStatus(n, { now: NOW })).toBe(MapStatus.DEGRADED);
  });
});

describe('groupByLocation', () => {
  it('groups nodes at the same or near-identical point into one marker', () => {
    const a = { NodeID: 1, Location: { lat: 43.084, lon: -77.68 } };
    const b = { NodeID: 2, Location: { lat: 43.0840004, lon: -77.6800004 } };
    const c = { NodeID: 3, Location: { lat: 43.09, lon: -77.69 } };
    const groups = groupByLocation([a, b, c]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.nodes.length === 2).nodes.map((n) => n.NodeID)).toEqual([1, 2]);
  });
  it('skips nodes without valid coordinates', () => {
    expect(groupByLocation([{ NodeID: 1, Location: null }, { NodeID: 2, Location: { lat: 0, lon: 0 } }])).toEqual([]);
  });
});

describe('buildFleetNodes', () => {
  const health = [node(), node({ NodeID: 2, Node_Name: 'Tree 2', Status_Code: 2 }), node({ NodeID: 3, Location: null })];
  const board = [{ NodeID: 1, Weight: 12.5, Temperature: 33 }];
  const alerts = [{ NodeID: 1, Alert_Type: 'Tipped', Is_Resolved: false }, { NodeID: 3, Alert_Type: 'Tipped', Is_Resolved: true }];

  it('derives status, joins latest reading and flags missing location', () => {
    const rows = buildFleetNodes({ nodes: health, board, alerts, now: NOW });
    expect(rows.find((r) => r.NodeID === 1)).toMatchObject({ mapStatus: MapStatus.DEGRADED, reading: { Weight: 12.5 }, hasLocation: true });
    expect(rows.find((r) => r.NodeID === 2).mapStatus).toBe(MapStatus.DEGRADED);
    expect(rows.find((r) => r.NodeID === 3)).toMatchObject({ mapStatus: MapStatus.ONLINE, hasLocation: false, reading: null });
  });
  it('ignores resolved alerts and non-fault alert types', () => {
    const rows = buildFleetNodes({ nodes: [node()], board: [], alerts: [{ NodeID: 1, Alert_Type: 'Sap Run', Is_Resolved: false }], now: NOW });
    expect(rows[0].mapStatus).toBe(MapStatus.ONLINE);
  });
});

describe('fault reason and clock', () => {
  it('explains a fault from status code and open alerts', () => {
    const rows = buildFleetNodes({
      nodes: [node({ Status_Code: 2 })],
      board: [],
      alerts: [{ NodeID: 1, Alert_Type: 'Tipped', Description: 'Bucket tipped over', Is_Resolved: false }],
      now: NOW,
    });
    expect(rows[0].faultReason).toBe('Reporting as degraded; Bucket tipped over');
  });
  it('has no fault reason when not faulted', () => {
    expect(buildFleetNodes({ nodes: [node()], now: NOW })[0].faultReason).toBeNull();
  });
  it('computes minutes since seen from the supplied clock', () => {
    expect(buildFleetNodes({ nodes: [node()], now: NOW })[0].minutesSinceSeen).toBe(10);
    expect(buildFleetNodes({ nodes: [node({ Last_Seen: null })], now: NOW })[0].minutesSinceSeen).toBeNull();
  });
});

describe('statusFromCode', () => {
  it('maps the raw codes the older screens use', () => {
    expect([0, 1, 2, 3].map(statusFromCode)).toEqual(['offline', 'online', 'degraded', 'maintenance']);
  });
  it('treats an unknown code as online, as those screens always did', () => {
    expect(statusFromCode(undefined)).toBe('online');
  });
});

describe('statusCounts', () => {
  it('counts every status including zeros', () => {
    const rows = buildFleetNodes({ nodes: [node(), node({ NodeID: 2, Status_Code: 2 })], board: [], alerts: [], now: NOW });
    expect(statusCounts(rows)).toEqual({ online: 1, stale: 0, degraded: 1, maintenance: 0, offline: 0 });
  });
});

describe('fleetLoadState', () => {
  const some = [];
  it('is loading until every source has settled', () => {
    expect(fleetLoadState({ nodes: some, board: null, alerts: some, error: null })).toEqual({ loading: true, stale: false });
  });
  it('is settled and healthy when all sources load', () => {
    expect(fleetLoadState({ nodes: some, board: some, alerts: some, error: null })).toEqual({ loading: false, stale: false });
  });
  it('flags stale when alerts fail on first load but nodes are in', () => {
    expect(fleetLoadState({ nodes: some, board: some, alerts: null, error: 'boom' })).toEqual({ loading: false, stale: true });
  });
  it('flags stale when a refresh fails after a good load', () => {
    expect(fleetLoadState({ nodes: some, board: some, alerts: some, error: 'boom' }).stale).toBe(true);
  });
  it('is an error, not stale, when the node list itself failed', () => {
    expect(fleetLoadState({ nodes: null, board: some, alerts: some, error: 'boom' })).toEqual({ loading: false, stale: false });
  });
});
