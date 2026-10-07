// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { can, Role } from '../src/business/permissions';

const auth = { current: null };
vi.mock('../src/context/auth', () => ({ useAuth: () => auth.current }));

// Charts and maps need a real canvas and layout; this page's logic does not.
vi.mock('../src/components/charts/ChartCard', () => ({ ChartCard: () => null }));
vi.mock('../src/components/map/LocationWidget', () => ({ LocationWidget: () => null }));

const tree = {
  NodeID: 3,
  Node_Name: 'Tree 3',
  Stand: 'Red Barn',
  Status_Code: 1,
  BucketID: 30,
  Weight: 20,
  Tare_Weight: 2,
  Battery_Percent: 80,
};

const runNodeAction = vi.fn();
const flagNode = vi.fn();
const assignShift = vi.fn();
vi.mock('../src/services/nodeService', async (importOriginal) => ({
  ...(await importOriginal()),
  getBoard: async () => [tree],
  runNodeAction: (...args) => runNodeAction(...args),
}));
vi.mock('../src/services/alertService', async (importOriginal) => ({
  ...(await importOriginal()),
  getAlerts: async () => [],
  flagNode: (...args) => flagNode(...args),
}));
vi.mock('../src/services/metricsService', async (importOriginal) => ({
  ...(await importOriginal()),
  getReadings: async () => [],
}));
vi.mock('../src/services/adminService', async (importOriginal) => ({
  ...(await importOriginal()),
  getUsers: async () => ({ users: [{ UserID: 7, fullName: 'Sam Student', usable: true }] }),
}));
vi.mock('../src/services/scheduleService', async (importOriginal) => ({
  ...(await importOriginal()),
  assignShift: (...args) => assignShift(...args),
}));

const { NodePage } = await import('../src/pages/NodePage');

async function renderAs(role) {
  auth.current = { role, can: (capability) => can(role, capability) };
  render(
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <MemoryRouter initialEntries={['/nodes/3']}>
        <Routes>
          <Route path="/nodes/:nodeId" element={<NodePage />} />
        </Routes>
      </MemoryRouter>
    </LocalizationProvider>,
  );
  await screen.findByRole('heading', { name: 'Tree 3' });
}

beforeEach(() => {
  runNodeAction.mockReset().mockResolvedValue({});
  flagNode.mockReset().mockResolvedValue({});
  assignShift.mockReset().mockResolvedValue({});
});
afterEach(cleanup);

describe('tree page field actions', () => {
  it('hides every field action from MSS, who cannot run them', async () => {
    await renderAs(Role.MSS);
    ['Collect bucket', 'Maintenance', 'Mark online', 'Report a spill', 'Report freezing'].forEach((name) => {
      expect(screen.queryByRole('button', { name })).toBeNull();
    });
    expect(screen.queryByText('At the tree')).toBeNull();
  });

  it('confirms a collected bucket', async () => {
    await renderAs(Role.STUDENT);
    fireEvent.click(screen.getByRole('button', { name: 'Collect bucket' }));
    expect(await screen.findByText('Bucket collected.')).toBeTruthy();
    expect(runNodeAction).toHaveBeenCalledWith(3, expect.objectContaining({ Action: 'collect' }));
  });

  it('confirms a reported spill', async () => {
    await renderAs(Role.STUDENT);
    fireEvent.click(screen.getByRole('button', { name: 'Report a spill' }));
    expect(await screen.findByText('Spill reported.')).toBeTruthy();
  });

  it('confirms an assigned shift', async () => {
    await renderAs(Role.ADMIN);
    fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Student' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Sam Student' }));
    fireEvent.click(screen.getByRole('button', { name: 'Assign this bucket' }));
    expect(await screen.findByText('Shift assigned to Sam Student.')).toBeTruthy();
  });
});
