import { matchPath } from 'react-router-dom';

/**
 * The guided walkthrough, from the sign-in page to live sensor data. Each step
 * highlights the element carrying `data-tour="<target>"` on a page matching
 * `path`. To add a step, tag the element and add an entry here.
 *
 * - `signedOut` steps live on the sign-in page and are skipped once signed in.
 * - `waitFor` steps have no Next button; the tour moves on when the user does
 *   the thing the step asks (here, signing in lands them on a later step's page).
 * - `clickToAdvance` makes Next click the highlighted element, for steps whose
 *   next page depends on what is clicked (which tree to open).
 */
export const TOUR_STEPS = [
  {
    path: ['/', '/login'],
    target: 'login-card',
    signedOut: true,
    title: 'Welcome to the sugarbush',
    body: 'See your trees and live sap readings in about a minute.',
  },
  {
    path: ['/', '/login'],
    target: 'sign-in',
    signedOut: true,
    waitFor: 'Sign in to continue the tour.',
    title: 'Sign in',
    body: 'Sign in. The tour continues from there.',
  },
  {
    path: '/dashboard',
    target: 'field-overview',
    title: 'The Bush',
    body: 'Check tree counts, full buckets, and offline sensors.',
  },
  {
    path: '/dashboard',
    target: 'fleet-map',
    title: 'Fleet map',
    body: 'Find each tree. Pin colors show sensor status.',
  },
  {
    path: '/dashboard',
    target: 'tree-card',
    clickToAdvance: true,
    title: 'Your trees',
    body: 'Tap this tree to see its latest readings.',
  },
  {
    path: '/nodes/:nodeId',
    target: 'node-bucket',
    title: 'Live bucket weight',
    body: 'The latest bucket weight, sent by this sensor.',
  },
  {
    path: '/nodes/:nodeId',
    target: 'node-chart',
    title: 'Readings over time',
    body: 'Try Hour to see recent changes. Tap Next when ready.',
  },
  {
    path: '/table',
    target: 'sugar-woods-chart',
    title: 'Sugar Woods',
    body: 'Compare readings. Export CSV or PDF.',
  },
];

function paths(step) {
  return [step.path].flat();
}

export function stepMatches(step, pathname) {
  return paths(step).some((pattern) => matchPath(pattern, pathname) != null);
}

/** A path the tour can navigate to by itself, or null for one like `/nodes/:nodeId`. */
export function staticPath(step) {
  return paths(step).find((pattern) => !pattern.includes(':')) ?? null;
}

/**
 * The step to show on `pathname`: the current one if it belongs here, else the
 * next one that does (signing in or opening a tree moves the tour forward),
 * else -1 to show the tour as paused.
 */
export function resolveStep(steps, index, pathname) {
  for (let next = index; next < steps.length; next += 1) {
    if (stepMatches(steps[next], pathname)) return next;
  }
  return -1;
}

/** The first step for someone starting the tour, signed in or not. */
export function firstStep(steps, signedIn) {
  const index = steps.findIndex((step) => Boolean(step.signedOut) !== signedIn);
  return Math.max(index, 0);
}

/** The nearest earlier step the tour can navigate back to, for resuming. */
export function resumeStep(steps, index, signedIn) {
  for (let back = Math.min(index, steps.length - 1); back >= 0; back -= 1) {
    const step = steps[back];
    if (Boolean(step.signedOut) !== signedIn && staticPath(step)) return back;
  }
  return firstStep(steps, signedIn);
}
