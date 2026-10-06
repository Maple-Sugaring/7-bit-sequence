import { describe, expect, test } from 'vitest';

import { factoryCommand, FIELD_FIRMWARE_MANIFEST, HELTEC_APP_ADDRESS, NODE_IDENTITY_ADDRESS, NODE_IDENTITY_MAGIC, provisionCommand, stampNodeCode } from '../src/hardware/heltecFlash';

describe('Heltec field identity', () => {
  test('tells a freshly flashed board which tree it is', () => {
    const line = provisionCommand({ Node_Code: 'NODE-017', Rf_Tag: '' });
    expect(line).toBe('PROVISION {"Node_Code":"NODE-017","Rf_Tag":""}\n');
    expect(factoryCommand()).toBe('FACTORY\n');
    expect(HELTEC_APP_ADDRESS).toBe(0x10000);
    expect(FIELD_FIRMWARE_MANIFEST).toBe('/firmware/manifest.json');
  });

  test('adds the node code beside the app image instead of changing it', () => {
    const app = new Uint8Array([1, 2, 3, 4]);
    const parts = stampNodeCode([{ address: HELTEC_APP_ADDRESS, data: app }], 'NODE-001');
    expect(parts[0].data).toEqual(app);
    expect(parts[1].address).toBe(NODE_IDENTITY_ADDRESS);
    const text = new TextDecoder().decode(parts[1].data);
    expect(text.startsWith(NODE_IDENTITY_MAGIC)).toBe(true);
    expect(text.slice(8, 16)).toBe('NODE-001');
  });
});