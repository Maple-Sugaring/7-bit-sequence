// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { can, Role } from '../src/business/permissions';

const auth = { current: null };
vi.mock('../src/context/auth', () => ({ useAuth: () => auth.current }));

const { LoginPage } = await import('../src/pages/LoginPage');
const { canVisit } = await import('../src/routes/navigation');

afterEach(cleanup);

function signedInAs(role) {
  auth.current = {
    isAuthenticated: true,
    restoring: false,
    role,
    can: (capability) => can(role, capability),
    signIn: vi.fn(),
  };
}

describe('canVisit', () => {
  it('follows the route capabilities', () => {
    expect(canVisit(Role.ADMIN, '/admin')).toBe(true);
    expect(canVisit(Role.MSS, '/admin')).toBe(false);
    expect(canVisit(Role.MSS, '/notifications')).toBe(false);
    expect(canVisit(Role.STUDENT, '/notifications')).toBe(true);
    expect(canVisit(Role.MSS, '/nodes/3')).toBe(true);
    expect(canVisit(Role.MSS, '/profile')).toBe(true);
  });
});

describe('login redirect after a role switch', () => {
  it('sends the new role to its landing page when the remembered page is off limits', () => {
    signedInAs(Role.MSS);
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/admin' } }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<p>dashboard</p>} />
          <Route path="/admin" element={<p>admin</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('dashboard')).toBeTruthy();
    expect(screen.queryByText('admin')).toBeNull();
  });

  it('still returns the user to a remembered page they can open', () => {
    signedInAs(Role.ADMIN);
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/admin' } }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<p>dashboard</p>} />
          <Route path="/admin" element={<p>admin</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('admin')).toBeTruthy();
  });
});
