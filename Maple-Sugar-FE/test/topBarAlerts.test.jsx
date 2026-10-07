// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { can, Role } from '../src/business/permissions';

const auth = { current: null };
vi.mock('../src/context/auth', () => ({ useAuth: () => auth.current }));

const getOpenAlertCount = vi.fn();
vi.mock('../src/services/alertService', async (importOriginal) => ({
  ...(await importOriginal()),
  getOpenAlertCount: (...args) => getOpenAlertCount(...args),
}));

const { TopBar } = await import('../src/components/layout/TopBar');

function renderAs(role) {
  auth.current = {
    user: { fullName: 'Pat Doe', email: 'pat@rit.edu', role },
    role,
    can: (capability) => can(role, capability),
    signOut: vi.fn(),
  };
  render(
    <MemoryRouter>
      <TopBar />
    </MemoryRouter>,
  );
}

function openProfileMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Your profile' }));
}

beforeEach(() => {
  getOpenAlertCount.mockReset();
  getOpenAlertCount.mockResolvedValue(2);
});
afterEach(cleanup);

describe('top bar alerts', () => {
  it('hides the bell and the Notifications menu item from MSS, and skips the count', () => {
    renderAs(Role.MSS);
    expect(screen.queryByRole('button', { name: /^Notifications/ })).toBeNull();
    openProfileMenu();
    expect(screen.queryByRole('menuitem', { name: 'Notifications' })).toBeNull();
    expect(getOpenAlertCount).not.toHaveBeenCalled();
  });

  it('shows both to a student', () => {
    renderAs(Role.STUDENT);
    expect(screen.getByRole('button', { name: /^Notifications/ })).toBeTruthy();
    openProfileMenu();
    expect(screen.getByRole('menuitem', { name: 'Notifications' })).toBeTruthy();
    expect(getOpenAlertCount).toHaveBeenCalled();
  });
});
