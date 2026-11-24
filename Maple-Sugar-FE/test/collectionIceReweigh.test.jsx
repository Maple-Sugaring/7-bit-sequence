// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REWEIGH_WAIT_MS,
  reweighFromReading,
  reweighStatus,
} from '../src/business/iceReweigh';
import { validateCollectionEntry, weightAfterIceError } from '../src/business/validation';
import { request } from '../src/data/transports/mockTransport';

// Run the page against the in-memory API whatever VITE_API_MODE the checkout sets.
vi.mock('../src/data/apiClient', async () => {
  const mock = await import('../src/data/transports/mockTransport');
  const call = (method) => (path, second, options) =>
    mock.request({ method, path, ...(method === 'GET' ? { query: second } : { body: second }), ...options });
  return {
    apiMode: 'mock',
    setAuthToken: mock.setAuthToken,
    apiClient: { get: call('GET'), post: call('POST'), patch: call('PATCH'), delete: (path, options) => mock.request({ method: 'DELETE', path, ...options }) },
  };
});

const { CollectionPage } = await import('../src/pages/CollectionPage');

/**
 * An iced bucket: the student turns on Ice in the bucket, takes the bucket off
 * the sensor, removes the ice, puts it back, and turns the node off and on.
 * The node's fresh reading fills in Weight after ice removed. With no reading
 * inside a minute, the collection saves with the last reading, flagged as not
 * reweighed. Save is never turned off.
 */

afterEach(cleanup);

const T0 = Date.parse('2026-11-23T20:00:00Z');
const at = (seconds) => new Date(T0 + seconds * 1000).toISOString();
const node = (weight, seconds, extra = {}) => ({ Weight: weight, Recorded_At: at(seconds), Status_Code: 3, ...extra });

describe('the reweigh rules', () => {
  it('checks a reweigh: lighter than the first weight and above the empty bucket', () => {
    expect(weightAfterIceError('40', 40, 2)).toMatch(/less than the weight with ice \(40 lb\)/);
    expect(weightAfterIceError('1.5', 40, 2)).toMatch(/empty bucket/);
    expect(weightAfterIceError('30', 40, 2)).toBeNull();
  });

  it('no longer requires the reweigh: without one the collection saves flagged', () => {
    const base = { NodeID: 1, Weight: '40', Sugar_Percent: '', Ice_Present: true };
    expect(validateCollectionEntry({ ...base, Weight_After_Ice: '' }).isValid).toBe(true);
    expect(validateCollectionEntry({ ...base, Weight_After_Ice: '30' }).isValid).toBe(true);
    expect(validateCollectionEntry({ ...base, Weight_After_Ice: '45' }).errors.Weight_After_Ice).toMatch(/less than/);
  });
});

describe('reading the node after the power cycle', () => {
  const options = { baselineAt: at(0), iceAt: T0, firstWeight: '40', tareLb: 2 };

  it('takes the first newer reading that looks like the bucket back with the ice out', () => {
    expect(reweighFromReading(node(32, 30), options)).toEqual({ weight: '30.0', recordedAt: at(30) });
  });

  it('skips the reading it already had, a bucket still off the sensor, and the ice still in', () => {
    expect(reweighFromReading(node(32, 0), options), 'same reading as when ice was tagged').toBeNull();
    expect(reweighFromReading(node(2, 30), options), 'bucket off: reads as the empty bucket').toBeNull();
    expect(reweighFromReading(node(42, 30), options), 'ice still in: not lighter').toBeNull();
    expect(reweighFromReading(node(32, 30, { Status_Code: 0 }), options), 'node offline').toBeNull();
    expect(reweighFromReading(null, options)).toBeNull();
  });

  it('uses the phone clock when the node had no reading when ice was tagged', () => {
    const noBaseline = { ...options, baselineAt: null };
    expect(reweighFromReading(node(32, -5), noBaseline)).toBeNull();
    expect(reweighFromReading(node(32, 5), noBaseline)?.weight).toBe('30.0');
  });

  it('waits a minute, then times out; a weight in means reweighed', () => {
    expect(reweighStatus({ ice: false, weightAfterIce: '', iceAt: T0, now: T0 })).toBe('off');
    expect(reweighStatus({ ice: true, weightAfterIce: '', iceAt: T0, now: T0 + 30_000 })).toBe('waiting');
    expect(reweighStatus({ ice: true, weightAfterIce: '', iceAt: T0, now: T0 + REWEIGH_WAIT_MS })).toBe('timed-out');
    expect(reweighStatus({ ice: true, weightAfterIce: '30', iceAt: T0, now: T0 + 90_000 })).toBe('reweighed');
  });

});

describe('POST /collections with ice in the mock API', () => {
  beforeAll(async () => {
    await request({ method: 'POST', path: '/auth/login', body: { email: 'mo5521@g.rit.edu', password: 'pw' } });
  });

  it('keeps both weights for a reweigh, and the flag for an iced bucket that was not reweighed', async () => {
    const reweighed = await request({
      method: 'POST',
      path: '/collections',
      body: { NodeID: 1, Weight: 30, Weight_Before_Ice: 40, Ice_Present: true, Sugar_Percent: null },
    });
    expect(reweighed.Entry.Weight_Before_Ice_Lb).toBe(40);
    expect(reweighed.Entry.Ice_Not_Reweighed).toBe(false);

    const flagged = await request({
      method: 'POST',
      path: '/collections',
      body: { NodeID: 1, Weight: 38, Ice_Present: true, Ice_Not_Reweighed: true, Sugar_Percent: null },
    });
    expect(flagged.Entry.Ice_Not_Reweighed).toBe(true);
    expect(flagged.Log.Ice_Not_Reweighed).toBe(true);

    await expect(
      request({ method: 'POST', path: '/collections', body: { NodeID: 1, Weight: 38, Ice_Not_Reweighed: true } }),
    ).rejects.toThrow(/tagged as having ice/);
  });
});

describe('the Collection page', () => {
  beforeAll(async () => {
    await request({ method: 'POST', path: '/auth/login', body: { email: 'mo5521@g.rit.edu', password: 'pw' } });
  });

  // Each test starts a fresh round on the phone: no saved round, drafts or pick.
  beforeEach(() => localStorage.clear());

  function renderPage() {
    render(
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <MemoryRouter>
          <CollectionPage />
        </MemoryRouter>
      </LocalizationProvider>,
    );
  }

  const saveButton = () => screen.getByRole('button', { name: /^Save & (next tree|finish round)$/ });

  /** The board row for the tree open on the form. */
  async function openTree() {
    const heading = await screen.findByRole('heading', { level: 2, name: /Tree/ });
    const board = await request({ method: 'GET', path: '/nodes/board' });
    return board.find((row) => row.Node_Name === heading.textContent);
  }

  it('lists the power cycle, keeps Save on, and fills in the node’s new reading', async () => {
    renderPage();
    const tree = await openTree();
    fireEvent.change(await screen.findByLabelText(/Sap weight \(lb\)/), { target: { value: '40' } });

    const ice = screen.getByRole('switch', { name: 'Ice in the bucket' });
    expect(ice.checked).toBe(false);
    fireEvent.click(ice);

    // The steps end with the power cycle, and Save stays on throughout.
    expect(within(screen.getByRole('list')).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Take the bucket off the sensor.',
      'Remove the ice from the bucket.',
      'Put the bucket back on the sensor.',
      'Turn the node off and back on.',
    ]);
    expect(screen.getByText(/Waiting for the node's new reading/)).toBeTruthy();
    expect(saveButton().disabled).toBe(false);

    // The node comes back on and reports: 30 lb of sap over its empty bucket.
    const tare = tree.Tare_Weight ?? 0;
    await request({
      method: 'POST',
      path: '/ingest',
      body: { Readings: [{ Node_Code: tree.Node_Code, Weight: 30 + tare, Recorded_At: new Date(Date.now() + 1000).toISOString() }] },
    });
    const afterIce = screen.getByLabelText(/Weight after ice removed/);
    await waitFor(() => expect(afterIce.value).toBe('30.0'), { timeout: 9000 });
    expect(screen.getByText(/New weight from the sensor at/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save & stop here' }));
    await waitFor(() => expect(screen.getAllByText('Ice removed · reweighed').length).toBeGreaterThan(0));
    const journal = await request({ method: 'GET', path: '/journal' });
    const stored = journal.find((entry) => entry.NodeID === tree.NodeID && entry.Weight_Before_Ice_Lb != null);
    expect(stored.Weight_Lb).toBeCloseTo(30 + tare);
    expect(stored.Ice_Not_Reweighed).toBe(false);
  }, 20_000);

  it('saves before a reading arrives with the last reading, flagged Not reweighed', async () => {
    renderPage();
    const tree = await openTree();
    fireEvent.change(await screen.findByLabelText(/Sap weight \(lb\)/), { target: { value: '36' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Ice in the bucket' }));

    expect(saveButton().disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Save & stop here' }));

    await waitFor(() => expect(screen.getAllByText('Ice · not reweighed').length).toBeGreaterThan(0));
    const journal = await request({ method: 'GET', path: '/journal' });
    const stored = journal.find((entry) => entry.NodeID === tree.NodeID && entry.Ice_Not_Reweighed);
    expect(stored, `the server got the flag for ${tree.Node_Name}`).toBeTruthy();
    expect(stored.Weight_Before_Ice_Lb).toBeNull();
    expect(stored.Weight_Lb, 'the last reading on the form, with the empty bucket added back').toBeCloseTo(
      36 + (tree.Tare_Weight ?? 0),
    );
  });

  it('a typed weight after ice removed is used, and turning ice off drops it', async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText(/Sap weight \(lb\)/), { target: { value: '40' } });
    const ice = screen.getByRole('switch', { name: 'Ice in the bucket' });
    fireEvent.click(ice);
    fireEvent.change(screen.getByLabelText(/Weight after ice removed/), { target: { value: '30' } });
    expect(screen.getByText('Reweighed without the ice')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Weight after ice removed/), { target: { value: '45' } });
    expect(screen.getByText(/less than the weight with ice \(40 lb\)/)).toBeTruthy();

    fireEvent.click(ice);
    expect(screen.queryByLabelText(/Weight after ice removed/)).toBeNull();
    fireEvent.click(ice);
    expect(screen.getByLabelText(/Weight after ice removed/).value).toBe('');
  });
});
