import { useCallback, useEffect, useMemo, useState } from 'react';
import { can, capabilitiesFor } from '../business/permissions';
import { apiMode } from '../data/apiClient';
import * as authService from '../services/authService';
import { AuthContext } from './auth';

const STORAGE_KEY = 'maple-sugar-session';

function readStoredSession() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      // Cookie (HTTP) or in-memory mock session first. localStorage is only a
      // fallback for mock mode, where there is no cookie to survive a refresh.
      const fromServer = await authService.restoreSession().catch(() => null);
      const restored = fromServer ?? (apiMode === 'mock' ? readStoredSession() : null);
      if (!active) return;
      setSession(restored);
      setRestoring(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (credentials) => {
    const next = await authService.signIn(credentials);
    setSession(next);
    if (apiMode === 'mock') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
    return next;
  }, []);

  const signOut = useCallback(async () => {
    await authService.signOut().catch(() => {});
    setSession(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo(() => {
    const role = session?.user?.role ?? null;

    return {
      user: session?.user ?? null,
      role,
      capabilities: capabilitiesFor(role),
      isAuthenticated: Boolean(session?.user),
      restoring,
      can: (capability) => can(role, capability),
      signIn,
      signOut,
    };
  }, [session, restoring, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
