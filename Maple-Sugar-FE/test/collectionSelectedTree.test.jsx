// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { request } from '../src/data/transports/mockTransport';

/**
 * A student who reloads the Collection page, for example because its data did
 * not load, lands back on the tree they had picked rather than the next one in
 * the round, even if they had not typed anything yet.
 */

// Run the page against the in-memory API whatever VITE_API_MODE the checkout sets.
vi.mock('../src/data/apiClient', async () => {
  const mock = await import('../src/data/transports/mockTransport');
  const call = (method) => (path, second, options) =>
    mock.request({ method, path, ...(method === 'GET' ? { query: second } : { body: second }), ...options });
  return {
    apiMode: 'mock',
    setAuthToken: mock.setAuthToken,
    apiClient: { get: call('GET'), post: call('POST'), patch: call('PATCH'), delete: (path, options) => mock.request({ method: 'DELETE', path, ...options }) },
  };
});

const { CollectionPage } = await import('../src/pages/CollectionPage');

afterEach(cleanup);

function renderPage() {
  return render(
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <MemoryRouter>
        <CollectionPage />
      </MemoryRouter>
    </LocalizationProvider>,
  );
}

const treeButtons = () => screen.getAllByRole('button', { pressed: false }).concat(screen.getAllByRole('button', { pressed: true }))
  .filter((button) => button.hasAttribute('aria-pressed'));
const pickedTree = () => screen.getAllByRole('button', { pressed: true }).find((button) => button.hasAttribute('aria-pressed'));

describe('the selected tree on the Collection page', () => {
  beforeAll(async () => {
    localStorage.clear();
    await request({ method: 'POST', path: '/auth/login', body: { email: 'mo5521@g.rit.edu', password: 'pw' } });
  });

  it('is still selected after a reload, typed in or not', async () => {
    renderPage();
    await waitFor(() => expect(treeButtons().length).toBeGreaterThan(3));
    const first = pickedTree().getAttribute('aria-label');

    // Pick a tree other than the one the page opened on, and type nothing.
    const other = treeButtons().find((button) => button.getAttribute('aria-label') !== first && !/logged/.test(button.getAttribute('aria-label')));
    const label = other.getAttribute('aria-label');
    fireEvent.click(other);
    expect(pickedTree().getAttribute('aria-label')).toBe(label);

    // Reload: the page mounts from scratch and its data loads again.
    cleanup();
    renderPage();
    await waitFor(() => expect(pickedTree()?.getAttribute('aria-label')).toBe(label));
  });

  it('forgets a pick for a tree that is no longer listed', async () => {
    localStorage.setItem('maple-collection-selected-tree', JSON.stringify({ nodeId: 999_999, savedAt: Date.now() }));
    renderPage();
    await waitFor(() => expect(pickedTree()).toBeTruthy());
    expect(pickedTree().getAttribute('aria-label')).not.toMatch(/999999/);
  });
});
