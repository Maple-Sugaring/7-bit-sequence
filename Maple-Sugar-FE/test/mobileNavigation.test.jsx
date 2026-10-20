// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { can, Role } from '../src/business/permissions';
import { AppNavigation } from '../src/components/layout/AppNavigation';
import { FieldOverview } from '../src/components/layout/FieldOverview';

let role = Role.ADMIN;
vi.mock('../src/context/auth', () => ({ useAuth: () => ({ role, can: (capability) => can(role, capability) }) }));
afterEach(cleanup);

function setup(as = Role.ADMIN, path = '/dashboard') {
  role = as;
  const router = createMemoryRouter([{ path: '*', element: <AppNavigation /> }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe('mobile navigation', () => {
  it('keeps field tasks one tap away and opens secondary tools from All pages', async () => {
    const router = setup();
    const mobile = () => within(screen.getByRole('navigation', { name: 'Mobile navigation' }));
    expect(mobile().getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/dashboard', '/map', '/collection', '/schedule']);
    fireEvent.click(mobile().getByRole('button', { name: 'All pages' }));
    const sheet = within(screen.getByRole('dialog', { name: 'All pages' }));
    fireEvent.click(sheet.getByRole('link', { name: /Deploy/ }));
    expect(router.state.location.pathname).toBe('/deploy');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mobile().getByRole('button', { name: 'All pages' }).className).toContain('is-active');
  });

  it('keeps restricted tools and alerts out of the MSS menu and shortcuts', () => {
    setup(Role.MSS);
    const mobile = () => within(screen.getByRole('navigation', { name: 'Mobile navigation' }));
    expect(mobile().getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/dashboard', '/map', '/table', '/deploy']);
    fireEvent.click(mobile().getByRole('button', { name: 'All pages' }));
    const sheet = within(screen.getByRole('dialog'));
    for (const name of [/Collection/, /Schedule/, /Admin/, /Notifications/]) expect(sheet.queryByRole('link', { name })).toBeNull();
    expect(sheet.getByRole('link', { name: 'Profile & settings' })).toBeTruthy();
  });

  it('marks a tree detail as Home and updates selection on browser navigation', async () => {
    const router = setup(Role.STUDENT, '/nodes/1');
    const mobile = () => within(screen.getByRole('navigation', { name: 'Mobile navigation' }));
    expect(mobile().getByRole('link', { name: 'The Bush' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(mobile().getByRole('link', { name: 'Map' }));
    expect(mobile().getByRole('link', { name: 'Map' }).getAttribute('aria-current')).toBe('page');
    await act(() => router.navigate(-1));
    expect(mobile().getByRole('link', { name: 'The Bush' }).getAttribute('aria-current')).toBe('page');
  });

  it('dismisses the sheet without changing the current page', async () => {
    const router = setup();
    fireEvent.click(screen.getByRole('button', { name: 'All pages' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close all pages' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.location.pathname).toBe('/dashboard');
  });

  it('does not reopen a sheet when returning through browser history', async () => {
    const router = setup();
    fireEvent.click(screen.getByRole('button', { name: 'All pages' }));
    await act(() => router.navigate('/map'));
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(() => router.navigate(-1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not present failed field data as zero healthy trees', () => {
    role = Role.MSS;
    const router = createMemoryRouter([{ path: '/', element: <FieldOverview fleet={{ nodes: [], loading: false, error: 'offline' }} /> }]);
    render(<RouterProvider router={router} />);
    expect(screen.getByText('Waiting for field data')).toBeTruthy();
    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.queryByRole('link', { name: /Start collecting/ })).toBeNull();
  });
});

