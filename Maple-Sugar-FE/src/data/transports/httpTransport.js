import { ApiError } from '../ApiError';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

let authToken = null;

export function setAuthToken(token) {
  authToken = token;
}

function buildUrl(path, query) {
  const url = new URL(`${BASE_URL.replace(/\/$/, '')}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

export async function request({ method = 'GET', path, query, body, signal }) {
  let response;

  const timeout = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(8000) : null;
  const combined =
    signal && timeout && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([signal, timeout])
      : (signal ?? timeout ?? undefined);

  try {
    response = await fetch(buildUrl(path, query), {
      method,
      signal: combined,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : null),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : null),
      },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });
  } catch (cause) {
    if (cause?.name === 'AbortError') {
      if (signal?.aborted) throw cause;
      throw new ApiError('The API did not respond in time.', { code: 'NETWORK' });
    }
    throw new ApiError('Network request failed.', { code: 'NETWORK' });
  }

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(payload?.message ?? `Request failed with status ${response.status}.`, {
      status: response.status,
      code: payload?.code ?? 'HTTP_ERROR',
      details: payload?.details ?? null,
    });
  }

  return payload;
}
