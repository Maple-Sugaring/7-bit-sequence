import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/auth';
import { TourContext } from './tour';
import { TourOverlay } from './TourOverlay';
import { TOUR_STEPS, firstStep, resolveStep, staticPath, stepMatches } from './tourSteps';

// sessionStorage, not state alone: Google sign-in leaves the app and comes
// back through /auth/callback, and the tour has to survive that round trip.
const STORAGE_KEY = 'maple-tour-step';

function readSession(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function writeSession(key, value) {
  try { sessionStorage.setItem(key, String(value)); } catch { /* Storage is optional. */ }
}

function readStoredStep() {
  try {
    const index = Number(sessionStorage.getItem(STORAGE_KEY) ?? NaN);
    return Number.isInteger(index) && index >= 0 && index < TOUR_STEPS.length ? index : null;
  } catch {
    return null;
  }
}

function storeStep(index) {
  try {
    if (index == null) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, String(index));
  } catch {
    // Private windows can refuse storage; the tour still runs for this page load.
  }
}

export function TourProvider({ children }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { isAuthenticated } = useAuth();
  const [index, setIndex] = useState(readStoredStep);
  const [offset, setOffset] = useState(() => Number(readSession('maple-tour-offset') ?? 0));
  const [nodePath, setNodePath] = useState(() => {
    const stored = readSession('maple-tour-node');
    return /^\/nodes\/[^/]+$/.test(stored ?? '') ? stored : null;
  });
  const [destination, setDestination] = useState(null);
  if (destination === pathname) setDestination(null);
  const resolved = index == null || (destination != null && destination !== pathname)
    ? -1 : resolveStep(TOUR_STEPS, index, pathname);
  if (resolved >= 0 && resolved !== index) {
    setIndex(resolved);
  }
  if (pathname.startsWith('/nodes/') && pathname !== nodePath) {
    setNodePath(pathname);
  }
  useEffect(() => { storeStep(index); }, [index]);
  useEffect(() => { if (nodePath) writeSession('maple-tour-node', nodePath); }, [nodePath]);
  useEffect(() => { writeSession('maple-tour-offset', offset); }, [offset]);

  const goTo = useCallback(
    (next) => {
      setIndex(next);
      storeStep(next);
      if (next == null || stepMatches(TOUR_STEPS[next], pathname)) return;
      // Revisit the actual tree, even after a detour or page reload.
      const to = staticPath(TOUR_STEPS[next]) ?? nodePath;
      if (to) {
        setDestination(to);
        navigate(to);
      } else navigate(-1);
    },
    [navigate, pathname, nodePath],
  );

  const value = useMemo(
    () => ({
      active: index != null,
      start: () => {
        const start = firstStep(TOUR_STEPS, isAuthenticated);
        setOffset(start);
        goTo(start);
      },
      end: () => goTo(null),
    }),
    [goTo, index, isAuthenticated],
  );

  return (
    <TourContext.Provider value={value}>
      <div data-tour-viewport style={index == null ? undefined : {
        height: 'calc(100dvh - var(--tour-card-height, 250px) - 84px)',
        overflowY: 'auto',
        position: 'relative',
      }}>{children}</div>
      {index != null ? <TourOverlay index={index} offset={offset} nodePath={nodePath} transitioning={destination != null} goTo={goTo} onEnd={value.end} /> : null}
    </TourContext.Provider>
  );
}
