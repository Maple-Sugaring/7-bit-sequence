// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TOUR_STEPS,
  firstStep,
  resolveStep,
  resumeStep,
  staticPath,
} from '../src/components/tour/tourSteps';

const auth = { current: { isAuthenticated: true } };
vi.mock('../src/context/auth', () => ({ useAuth: () => auth.current }));

const { TourProvider } = await import('../src/components/tour/TourProvider');
const { useTour } = await import('../src/components/tour/tour');

const indexOf = (target) => TOUR_STEPS.findIndex((step) => step.target === target);

describe('tour steps', () => {
  it('starts signed-out visitors on the sign-in page and signed-in users on The Bush', () => {
    expect(TOUR_STEPS[firstStep(TOUR_STEPS, false)].target).toBe('login-card');
    expect(TOUR_STEPS[firstStep(TOUR_STEPS, true)].path).toBe('/dashboard');
  });

  it('moves forward when the user reaches a later step page', () => {
    // Signing in from the sign-in step lands on The Bush.
    expect(resolveStep(TOUR_STEPS, indexOf('sign-in'), '/dashboard')).toBe(indexOf('field-overview'));
    // Opening a tree from its card lands on the tree page.
    expect(resolveStep(TOUR_STEPS, indexOf('tree-card'), '/nodes/3')).toBe(indexOf('node-bucket'));
  });

  it('pauses on a page outside the walkthrough or behind the current step', () => {
    expect(resolveStep(TOUR_STEPS, indexOf('field-overview'), '/schedule')).toBe(-1);
    expect(resolveStep(TOUR_STEPS, indexOf('node-chart'), '/dashboard')).toBe(-1);
  });

  it('resumes at the nearest step it can navigate to', () => {
    const resumed = resumeStep(TOUR_STEPS, indexOf('node-chart'), true);
    expect(TOUR_STEPS[resumed].target).toBe('tree-card');
    expect(staticPath(TOUR_STEPS[resumed])).toBe('/dashboard');
    // Signed out again, the only place to resume is the sign-in page.
    expect(TOUR_STEPS[resumeStep(TOUR_STEPS, indexOf('node-chart'), false)].signedOut).toBe(true);
  });

  it('keeps every target unique so each step highlights one element', () => {
    const targets = TOUR_STEPS.map((step) => step.target);
    expect(new Set(targets).size).toBe(targets.length);
  });
});

function StartButton() {
  const tour = useTour();
  return <button onClick={tour.start}>start</button>;
}

function TreeLink() {
  const navigate = useNavigate();
  return <button data-tour="tree-card" onClick={() => navigate('/nodes/7')}>tree</button>;
}

function Detour() {
  const navigate = useNavigate();
  return <button onClick={() => navigate('/schedule')}>leave tour</button>;
}

function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TourProvider>
        <StartButton />
        <Detour />
        <Routes>
          <Route path="/dashboard" element={<TreeLink />} />
          <Route path="/nodes/:nodeId" element={<><p>tree page</p><button data-tour-unit="hour">Hours</button></>} />
          <Route path="/table" element={<p>all readings</p>} />
          <Route path="/schedule" element={<p>schedule</p>} />
        </Routes>
      </TourProvider>
    </MemoryRouter>,
  );
}

describe('tour overlay', () => {
  beforeEach(() => {
    auth.current = { isAuthenticated: true };
    sessionStorage.clear();
  });
  afterEach(cleanup);

  it('walks a signed-in user from The Bush into a tree', () => {
    renderApp('/dashboard');
    fireEvent.click(screen.getByText('start'));
    expect(screen.getByText('The Bush')).toBeTruthy();
    expect(screen.getByLabelText(`Step 1 of ${TOUR_STEPS.length - firstStep(TOUR_STEPS, true)}`)).toBeTruthy();
    // No Back into the sign-in steps once signed in.
    expect(screen.getByRole('button', { name: 'Back' }).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Fleet map')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Your trees')).toBeTruthy();

    // Next clicks the highlighted tree, and the tour follows it to the tree page.
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('tree page')).toBeTruthy();
    expect(screen.getByText('Live bucket weight')).toBeTruthy();
  });

  it('shows as paused off the walkthrough and ends on request', () => {
    sessionStorage.setItem('maple-tour-step', String(indexOf('field-overview')));
    renderApp('/schedule');
    expect(screen.getByText('Tour paused')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'End tour' }));
    expect(screen.queryByText('Tour paused')).toBeNull();
    expect(sessionStorage.getItem('maple-tour-step')).toBeNull();
  });

  it('remembers the exact tree chart when resuming and reloading', () => {
    sessionStorage.setItem('maple-tour-step', String(indexOf('node-chart')));
    sessionStorage.setItem('maple-tour-offset', '2');
    renderApp('/nodes/7');
    expect(screen.getByLabelText('Step 5 of 6')).toBeTruthy();
    fireEvent.click(screen.getByText('leave tour'));
    expect(screen.getByText('Tour paused')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByText('Readings over time')).toBeTruthy();
    expect(sessionStorage.getItem('maple-tour-node')).toBe('/nodes/7');
    cleanup();
    renderApp('/schedule');
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByText('Readings over time')).toBeTruthy();
    expect(screen.queryByText('Your trees')).toBeNull();
  });

  it('keeps the original eight-step count after signing in', () => {
    sessionStorage.setItem('maple-tour-step', String(indexOf('sign-in')));
    sessionStorage.setItem('maple-tour-offset', '0');
    renderApp('/dashboard');
    expect(screen.getByLabelText('Step 3 of 8')).toBeTruthy();
    expect(screen.queryByText('Step 0 of 6')).toBeNull();
    expect(sessionStorage.getItem('maple-tour-step')).toBe(String(indexOf('field-overview')));
  });

  it('can collapse instructions and advance by choosing Hours', () => {
    sessionStorage.setItem('maple-tour-step', String(indexOf('node-chart')));
    renderApp('/nodes/7');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse tour' }));
    expect(screen.queryByText('Tap Hour to see recent sap changes and continue.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Expand tour' }));
    expect(screen.getByText('Tap Hour to see recent sap changes and continue.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hours' }));
    expect(screen.getByText('Sugar Woods')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('[data-tour-active="true"]')).toBeNull();
  });

  it('waits for sign-in instead of offering Next', () => {
    auth.current = { isAuthenticated: false };
    render(
      <MemoryRouter initialEntries={['/login']}>
        <TourProvider>
          <StartButton />
          <Routes>
            <Route path="/login" element={<p>sign in page</p>} />
          </Routes>
        </TourProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('start'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Sign in to continue the tour.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });
});
