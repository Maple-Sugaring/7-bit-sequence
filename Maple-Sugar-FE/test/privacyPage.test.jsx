// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = { current: { isAuthenticated: false, restoring: false, role: null, signIn: vi.fn() } };
vi.mock('../src/context/auth', () => ({ useAuth: () => auth.current }));

const { AppRoutes } = await import('../src/routes/AppRoutes');
const { LoginPage } = await import('../src/pages/LoginPage');

afterEach(cleanup);

describe('privacy policy', () => {
  it('is public, so Google and signed-out visitors can read it', () => {
    render(
      <MemoryRouter initialEntries={['/privacy']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeTruthy();
    // Google's user data policy requires the Limited Use disclosure.
    expect(screen.getByText(/Limited Use requirements/)).toBeTruthy();
  });

  it('is linked from the sign-in page', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Privacy policy' }).getAttribute('href')).toBe('/privacy');
  });
});
