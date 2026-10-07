// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { can, Role } from '../src/business/permissions';

const auth = { current: null };
vi.mock('../src/context/auth', () => ({ useAuth: () => auth.current }));

const slot = (id, extra) => ({
  SlotID: id,
  Task: 'Sap Collection',
  Stand: 'Red Barn',
  Starts_At: '2099-03-01T13:00:00.000Z',
  Ends_At: '2099-03-01T15:00:00.000Z',
  Capacity: 2,
  Assigned_UserIDs: [],
  Assignees: [],
  Is_Complete: false,
  ...extra,
});
vi.mock('../src/services/scheduleService', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getSchedule: async () => ({
      slots: [
        { ...slot(1, { Assigned_UserIDs: [9] }), remaining: 1, assigned: [{ userId: 9, name: 'Sam' }], day: '2099-03-01' },
        { ...slot(2, { Capacity: 1, Task: 'Battery Swap' }), remaining: 1, assigned: [], day: '2099-03-01' },
      ],
      summary: { unfilledPast: 0 },
    }),
  };
});

const { SchedulePage } = await import('../src/pages/SchedulePage');

afterEach(cleanup);

async function renderAs(role) {
  auth.current = { user: { id: 1, fullName: 'Ada Admin' }, role, can: (capability) => can(role, capability) };
  render(
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <MemoryRouter initialEntries={['/schedule']}>
        <SchedulePage />
      </MemoryRouter>
    </LocalizationProvider>,
  );
  await screen.findAllByText(/spots? open/);
}

describe('shift cards', () => {
  it('counts spots against the shift capacity', async () => {
    await renderAs(Role.ADMIN);
    expect(screen.getByText('1 of 2 spots open')).toBeTruthy();
    expect(screen.getByText('1 of 1 spot open')).toBeTruthy();
  });

  it('labels the mark-complete checkbox for screen readers without a console error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await renderAs(Role.ADMIN);
    expect(screen.getByRole('checkbox', { name: 'Mark Sap Collection complete' })).toBeTruthy();
    expect(error.mock.calls.filter(([message]) => String(message).includes('does not recognize'))).toEqual([]);
    error.mockRestore();
  });
});
