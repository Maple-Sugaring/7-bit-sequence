import { useCallback, useEffect, useState } from 'react';
import { toUserMessage } from '../../data/ApiError';

/**
 * Runs a service call and exposes its lifecycle to a component.
 *
 * `loader` must be memoized by the caller; its identity is what triggers a
 * refetch. Loading is derived by comparing the loader that produced the
 * current result against the current one, which keeps the previous data on
 * screen during a refetch instead of flashing a spinner.
 */
export function useAsync(loader, { enabled = true, initialData = null } = {}) {
  // `token` lets refresh() re-run the same loader.
  const [token, setToken] = useState(0);
  const [result, setResult] = useState({
    data: initialData,
    error: null,
    loader: null,
    token: -1,
  });

  const settled = result.loader === loader && result.token === token;
  const loading = enabled && !settled;

  useEffect(() => {
    if (!enabled) return undefined;

    // Guards against a slow earlier request resolving after a faster later one.
    let cancelled = false;

    loader().then(
      (data) => {
        if (!cancelled) setResult({ data, error: null, loader, token });
      },
      (error) => {
        if (!cancelled) {
          setResult({ data: null, error: toUserMessage(error), loader, token });
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [enabled, loader, token]);

  const refresh = useCallback(() => setToken((previous) => previous + 1), []);

  return { data: result.data, error: result.error, loading, refresh };
}

/**
 * Wraps a write so a component gets pending state and a normalized error
 * without repeating try/catch in every handler.
 */
export function useAction(action) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const execute = useCallback(
    async (...args) => {
      setPending(true);
      setError(null);
      try {
        return { ok: true, data: await action(...args) };
      } catch (caught) {
        const message = toUserMessage(caught);
        setError(message);
        return { ok: false, error: message };
      } finally {
        setPending(false);
      }
    },
    [action],
  );

  const clearError = useCallback(() => setError(null), []);

  return { execute, pending, error, clearError };
}
