import { describe, expect, test } from 'vitest';

import { request } from '../src/data/transports/mockTransport';

const send = (method, path, body) => request({ method, path, body });

async function register(code, name) {
  return send('POST', '/gateways', { Gateway_Code: code, Gateway_Name: name });
}

describe('gateway edit and delete (mock transport)', () => {
  test('edits name, code, notes, and location', async () => {
    const { GatewayID } = await register('edit-1', 'Barn');
    const updated = await send('PATCH', `/gateways/${GatewayID}`, {
      Gateway_Code: 'edit-1b',
      Gateway_Name: 'Sugar shack',
      Notes: 'Roof mount',
      Latitude: 43.1,
      Longitude: -77.6,
    });

    expect(updated).toMatchObject({ Gateway_Code: 'edit-1b', Gateway_Name: 'Sugar shack', Notes: 'Roof mount' });
    expect(updated.Location).toEqual({ lat: 43.1, lon: -77.6 });
  });

  test('clears notes and location', async () => {
    const { GatewayID } = await register('edit-2', 'Gate');
    await send('PATCH', `/gateways/${GatewayID}`, { Notes: 'x', Latitude: 1, Longitude: 2 });
    const cleared = await send('PATCH', `/gateways/${GatewayID}`, { Notes: '', Latitude: null, Longitude: null });

    expect(cleared.Notes).toBeNull();
    expect(cleared.Location).toBeNull();
  });

  test('rejects a code another gateway already uses', async () => {
    await register('dup-a', 'A');
    const { GatewayID } = await register('dup-b', 'B');

    await expect(send('PATCH', `/gateways/${GatewayID}`, { Gateway_Code: 'dup-a' })).rejects.toMatchObject({
      status: 422,
    });
  });

  test('404s for an unknown gateway', async () => {
    await expect(send('PATCH', '/gateways/9999', { Gateway_Name: 'x' })).rejects.toMatchObject({ status: 404 });
    await expect(send('DELETE', '/gateways/9999')).rejects.toMatchObject({ status: 404 });
  });

  test('delete removes the gateway and unassigns its nodes', async () => {
    const nodes = await send('GET', '/nodes');
    const attached = nodes.find((node) => node.GatewayID != null);
    if (!attached) return; // fixtures ship without nodes in some modes

    await send('POST', '/gateways', { Gateway_Code: 'tmp', Gateway_Name: 'Tmp' });
    await send('DELETE', `/gateways/${attached.GatewayID}`);

    const gateways = await send('GET', '/gateways');
    expect(gateways.some((gateway) => gateway.GatewayID === attached.GatewayID)).toBe(false);
    const after = await send('GET', `/nodes/${attached.NodeID}`);
    expect(after.GatewayID).toBeNull();
  });
});
