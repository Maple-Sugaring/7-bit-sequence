// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = { current: null };
vi.mock('../src/context/auth', () => ({ useAuth: () => auth.current }));

const { LandingPage } = await import('../src/pages/LandingPage');

beforeEach(() => {
  auth.current = {
    isAuthenticated: false,
    restoring: false,
    role: null,
    can: () => false,
    signIn: vi.fn(),
  };
});

afterEach(cleanup);

describe('LandingPage', () => {
  it('renders the hero, telemetry preview, hardware pipeline, and role overview sections', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Hero branding & title
    expect(screen.getByText(/Smart Sap Monitoring for the/i)).toBeTruthy();
    expect(screen.getByText('The sugarbush')).toBeTruthy();

    // Hardware pipeline steps
    expect(screen.getByText('Maple Tree Tap & Bucket')).toBeTruthy();
    expect(screen.getByText('Heltec WiFi LoRa 32 V3')).toBeTruthy();
    expect(screen.getByText('Raspberry Pi USB Gateway')).toBeTruthy();
    expect(screen.getByText('React & Express Cloud App')).toBeTruthy();

    // Program & roles overview
    expect(screen.getByText('Student Volunteers')).toBeTruthy();
    expect(screen.getByText('Maple Sugaring Society (MSS)')).toBeTruthy();
    expect(screen.getByText('Program Administrators')).toBeTruthy();
  });

  it('shows the all-taps telemetry summary without a node selector', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/BUSH_TOTAL/)).toBeTruthy();
    expect(screen.getByText('2.25% avg')).toBeTruthy();
    expect(screen.getByText('2 Active LoRa Nodes')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Tree 0[12] ·/i })).toBeNull();
  });

  it('displays an OAuth error banner inside the sign-in section when ?error= is present', () => {
    render(
      <MemoryRouter initialEntries={['/login?error=Account+not+invited']}>
        <Routes>
          <Route path="/login" element={<LandingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Account not invited')).toBeTruthy();
  });
});
