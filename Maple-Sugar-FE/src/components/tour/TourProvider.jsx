import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/auth';
import { TourContext } from './tour';
import { TourOverlay } from './TourOverlay';
import { TOUR_STEPS, firstStep, staticPath, stepMatches } from './tourSteps';

// sessionStorage, not state alone: Google sign-in leaves the app and comes
// back through /auth/callback, and the tour has to survive that round trip.
const STORAGE_KEY = 'maple-tour-step';

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

  const goTo = useCallback(
    (next) => {
      setIndex(next);
      storeStep(next);
      if (next == null || stepMatches(TOUR_STEPS[next], pathname)) return;
      // A step on a page like /nodes/:nodeId has no address of its own, so going
      // back to it means going back in history to the tree that was open.
      const to = staticPath(TOUR_STEPS[next]);
      if (to) navigate(to);
      else navigate(-1);
    },
    [navigate, pathname],
  );

  const value = useMemo(
    () => ({
      active: index != null,
      start: () => goTo(firstStep(TOUR_STEPS, isAuthenticated)),
      end: () => goTo(null),
    }),
    [goTo, index, isAuthenticated],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {index != null ? <TourOverlay index={index} goTo={goTo} onEnd={value.end} /> : null}
    </TourContext.Provider>
  );
}
