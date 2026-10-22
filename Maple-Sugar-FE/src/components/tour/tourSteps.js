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
    body: 'This tour walks you from signing in to the live readings coming off each tapped tree. It takes about a minute.',
  },
  {
    path: ['/', '/login'],
    target: 'sign-in',
    signedOut: true,
    waitFor: 'Sign in to continue the tour.',
    title: 'Sign in',
    body: 'Sign in to open the bush. The tour picks up again on the next page.',
  },
  {
    path: '/dashboard',
    target: 'field-overview',
    title: 'The Bush',
    body: 'Every field day starts here: how many trees are deployed, how many buckets are full, and whether any node has gone quiet.',
  },
  {
    path: '/dashboard',
    target: 'fleet-map',
    title: 'Fleet map',
    body: 'Each pin is a tapped tree, coloured by its status. Open the full map when you need to find a tree in the field.',
  },
  {
    path: '/dashboard',
    target: 'tree-card',
    clickToAdvance: true,
    title: 'Your trees',
    body: "Each card is one tree's latest report: battery, how full the bucket is, sugar content and shelf life. Press Next to open this tree.",
  },
  {
    path: '/nodes/:nodeId',
    target: 'node-bucket',
    title: 'Live bucket weight',
    body: 'A sensor node on the tree weighs its bucket and radios the reading through a gateway. This is the newest one.',
  },
  {
    path: '/nodes/:nodeId',
    target: 'node-chart',
    title: 'Readings over time',
    body: 'Every reading from this tree this season. Switch between hours, days and weeks to see how fast the sap is running.',
  },
  {
    path: '/table',
    target: 'sugar-woods-chart',
    title: 'Sugar Woods',
    body: "Compare every tree at once and export the readings as CSV or PDF. That's the whole trip, from signing in to live data.",
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
