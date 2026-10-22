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

function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TourProvider>
        <StartButton />
        <Routes>
          <Route path="/dashboard" element={<TreeLink />} />
          <Route path="/nodes/:nodeId" element={<p>tree page</p>} />
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
    expect(screen.getByText(`Step 1 of ${TOUR_STEPS.length - firstStep(TOUR_STEPS, true)}`)).toBeTruthy();
    // No Back into the sign-in steps once signed in.
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();

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
