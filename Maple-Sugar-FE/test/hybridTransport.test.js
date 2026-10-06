import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../src/data/transports/httpTransport', () => ({
  request: vi.fn(async () => ({ user: { UserID: 7, RoleID: 2 } })),
  setAuthToken: vi.fn(),
}));
vi.mock('../src/data/transports/mockTransport', () => ({
  request: vi.fn(async () => 'mock'),
  adoptUser: vi.fn(),
  forgetUser: vi.fn(),
}));

import * as http from '../src/data/transports/httpTransport';
import * as mock from '../src/data/transports/mockTransport';
import { request } from '../src/data/transports/hybridTransport';

describe('hybrid transport', () => {
  beforeEach(() => vi.clearAllMocks());

  test.each(['/auth/session', '/profile', '/notifications/test', '/schedule/slots', '/schedule/availability', '/users', '/roles'])(
    'sends %s to the real API',
    async (path) => {
      await request({ method: 'GET', path });
      expect(http.request).toHaveBeenCalledTimes(1);
      expect(mock.request).not.toHaveBeenCalled();
    },
  );

  test.each(['/nodes/board', '/metrics', '/alerts', '/journal', '/weather/live', '/gateways'])(
    'keeps %s on mock data',
    async (path) => {
      expect(await request({ method: 'GET', path })).toBe('mock');
      expect(http.request).not.toHaveBeenCalled();
    },
  );

  test('mirrors the real session user into the mock, and forgets it on logout', async () => {
    await request({ method: 'GET', path: '/auth/session' });
    expect(mock.adoptUser).toHaveBeenCalledWith({ UserID: 7, RoleID: 2 });

    await request({ method: 'POST', path: '/auth/logout' });
    expect(mock.forgetUser).toHaveBeenCalled();
  });
});
