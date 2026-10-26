import { describe, expect, test, vi } from 'vitest';

// The checked-in .env points the client at the real API; send it to the mock.
vi.mock('../src/data/apiClient', async () => {
  const { request } = await import('../src/data/transports/mockTransport');
  return {
    apiMode: 'mock',
    setAuthToken() {},
    apiClient: {
      get: (path, query) => request({ method: 'GET', path, query }),
      post: (path, body) => request({ method: 'POST', path, body }),
      patch: (path, body) => request({ method: 'PATCH', path, body }),
      delete: (path) => request({ method: 'DELETE', path }),
    },
  };
});

const { cancelCalibration, getCalibration, tareNode } = await import('../src/services/nodeService');

describe('calibration through the node service', () => {
  test('cancel stops the waiting command', async () => {
    const queued = await tareNode(2);
    expect(await cancelCalibration(2)).toMatchObject({ CommandID: queued.CommandID, Status: 'cancelled' });
    expect((await getCalibration(2)).Command).toMatchObject({ CommandID: queued.CommandID, Status: 'cancelled' });
  });
});
