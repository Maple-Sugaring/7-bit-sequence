import { createContext, useContext } from 'react';

/**
 * Kept apart from the provider component, like context/auth.js. Outside a
 * TourProvider (component tests) the tour is inert rather than an error, since
 * starting it is only ever an optional button.
 */
const INERT_TOUR = { active: false, start: () => {}, end: () => {} };

export const TourContext = createContext(INERT_TOUR);

export function useTour() {
  return useContext(TourContext);
}
