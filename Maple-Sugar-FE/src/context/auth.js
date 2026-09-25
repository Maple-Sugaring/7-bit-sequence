import { createContext, useContext } from 'react';

/**
 * Kept apart from the provider component so that importing `useAuth` does not
 * pull a component into a hooks-only module (and vice versa for fast refresh).
 */
export const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider.');
  }
  return context;
}
