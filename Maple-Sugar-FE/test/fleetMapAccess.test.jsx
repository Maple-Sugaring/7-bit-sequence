// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canAny, Capability, Role } from '../src/business/permissions';

const auth = { current: { isAuthenticated: true, restoring: false, role: 'student', can: () => true } };
vi.mock('../src/context/auth', () => ({ useAuth: () => auth.current }));

const getBoard = vi.fn();
const getAlerts = vi.fn();
vi.mock('../src/services/nodeService', async (importOriginal) => ({
  ...(await importOriginal()),
  getBoard: (...args) => getBoard(...args),
}));
vi.mock('../src/services/alertService', async (importOriginal) => ({
  ...(await importOriginal()),
  getAlerts: (...args) => getAlerts(...args),
}));

const { ProtectedRoute } = await import('../src/routes/ProtectedRoute');
const { navItemsFor } = await import('../src/routes/navigation');
const { useFleetMap } = await import('../src/services/hooks');

afterEach(cleanup);

describe('map access', () => {
  it('canAny needs just one of the capabilities', () => {
    expect(canAny(Role.STUDENT, [Capability.MANAGE_USERS, Capability.VIEW_NODES])).toBe(true);
    expect(canAny(Role.MSS, [Capability.MANAGE_USERS, Capability.VIEW_NODES])).toBe(false);
    expect(canAny(Role.STUDENT, [])).toBe(false);
  });

  it('puts Map in the nav for roles that can view the dashboard or nodes', () => {
    [Role.ADMIN, Role.STUDENT, Role.MSS].forEach((role) => {
      expect(navItemsFor(role).map((item) => item.to)).toContain('/map');
    });
  });

  const gate = (capability) =>
    render(
      <MemoryRouter>
        <ProtectedRoute capability={capability}>
          <p>secret</p>
        </ProtectedRoute>
      </MemoryRouter>,
    );

  it('lets a user in on any one capability of a list', () => {
    auth.current = { ...auth.current, can: (c) => c === Capability.VIEW_NODES };
    gate([Capability.VIEW_DASHBOARD, Capability.VIEW_NODES]);
    expect(screen.getByText('secret')).toBeTruthy();
  });

  it('turns a user away who has none of them', () => {
    auth.current = { ...auth.current, can: () => false };
    gate([Capability.VIEW_DASHBOARD, Capability.VIEW_NODES]);
    expect(screen.queryByText('secret')).toBeNull();
    expect(screen.getByText('You do not have access to this page')).toBeTruthy();
  });

  it('still accepts a single capability and none at all', () => {
    auth.current = { ...auth.current, can: (c) => c === Capability.VIEW_DASHBOARD };
    gate(Capability.VIEW_DASHBOARD);
    expect(screen.getByText('secret')).toBeTruthy();
    cleanup();
    gate(undefined);
    expect(screen.getByText('secret')).toBeTruthy();
  });
});

describe('useFleetMap', () => {
  const row = (id, extra = {}) => ({
    NodeID: id,
    Node_Name: `Tree ${id}`,
    Stand: 'Red Barn',
    Status_Code: 1,
    Last_Seen: new Date().toISOString(),
    Location: { lat: 43.08, lon: -77.68 },
    ...extra,
  });

  beforeEach(() => {
    getBoard.mockReset();
    getAlerts.mockReset();
  });

  it('builds nodes from the board and the alerts', async () => {
    getBoard.mockResolvedValue([row(1), row(2)]);
    getAlerts.mockResolvedValue([{ NodeID: 2, Alert_Type: 'Tipped', Is_Resolved: false, Description: 'Tipped over' }]);
    const { result } = renderHook(() => useFleetMap());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.nodes.map((node) => node.mapStatus)).toEqual(['online', 'degraded']);
    expect(result.current.stale).toBe(false);
  });

  it('keeps the last good data and flags it when a refresh fails', async () => {
    getBoard.mockResolvedValue([row(1)]);
    getAlerts.mockResolvedValue([]);
    const { result } = renderHook(() => useFleetMap());
    await waitFor(() => expect(result.current.loading).toBe(false));

    getBoard.mockRejectedValue(new Error('network'));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.nodes).toHaveLength(1);
    expect(result.current.stale).toBe(true);
  });

  it('flags a first load where alerts failed instead of showing faults as healthy', async () => {
    getBoard.mockResolvedValue([row(1)]);
    getAlerts.mockRejectedValue(new Error('alerts down'));
    const { result } = renderHook(() => useFleetMap());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.nodes).toHaveLength(1);
    expect(result.current.stale).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it('reports an error with no nodes when the board itself fails', async () => {
    getBoard.mockRejectedValue(new Error('down'));
    getAlerts.mockResolvedValue([]);
    const { result } = renderHook(() => useFleetMap());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.nodes).toEqual([]);
    expect(result.current.stale).toBe(false);
  });
});
