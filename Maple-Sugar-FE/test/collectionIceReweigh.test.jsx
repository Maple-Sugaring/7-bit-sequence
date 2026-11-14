// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
 * An iced bucket is reweighed before it can be saved. The user enters the
 * weight, turns on Ice in the bucket, Save turns off, they take the bucket off
 * the sensor, remove the ice, put it back, and enter Weight after ice removed.
 */

afterEach(cleanup);

describe('the reweigh rules', () => {
  it('needs a weight after the ice is out, lighter than the first and above the empty bucket', () => {
    expect(weightAfterIceError('', 60, 2)).toMatch(/Remove the ice, reweigh/);
    expect(weightAfterIceError('60', 60, 2)).toMatch(/less than the weight with ice \(60 lb\)/);
    expect(weightAfterIceError('65', 60, 2)).toMatch(/less than the weight with ice/);
    expect(weightAfterIceError('1.5', 60, 2)).toMatch(/empty bucket/);
    expect(weightAfterIceError('-3', 60, 2)).toMatch(/pounds/);
    expect(weightAfterIceError('45', 60, 2)).toBeNull();
  });

  it('only asks for the reweigh when ice is tagged', () => {
    const base = { NodeID: 1, Weight: '60', Sugar_Percent: '' };
    expect(validateCollectionEntry({ ...base, Ice_Present: false }).isValid).toBe(true);
    expect(validateCollectionEntry({ ...base, Ice_Present: true, Weight_After_Ice: '' }).errors.Weight_After_Ice).toBeTruthy();
    expect(validateCollectionEntry({ ...base, Ice_Present: true, Weight_After_Ice: '45' }).isValid).toBe(true);
  });
});

describe('POST /collections with ice in the mock API', () => {
  beforeAll(async () => {
    await request({ method: 'POST', path: '/auth/login', body: { email: 'mo5521@g.rit.edu', password: 'pw' } });
  });

  it('keeps both weights and rejects a reweigh that is not lighter', async () => {
    const saved = await request({
      method: 'POST',
      path: '/collections',
      body: { NodeID: 1, Weight: 45, Weight_Before_Ice: 60, Ice_Present: true, Sugar_Percent: null },
    });
    expect(saved.Entry.Weight_Lb).toBe(45);
    expect(saved.Entry.Weight_Before_Ice_Lb).toBe(60);
    expect(saved.Log.Weight_Before_Ice_Lb).toBe(60);

    await expect(
      request({
        method: 'POST',
        path: '/collections',
        body: { NodeID: 1, Weight: 61, Weight_Before_Ice: 60, Ice_Present: true, Sugar_Percent: null },
      }),
    ).rejects.toThrow(/less than the weight with ice/);
  });
});

describe('the Collection page', () => {
  beforeAll(async () => {
    await request({ method: 'POST', path: '/auth/login', body: { email: 'mo5521@g.rit.edu', password: 'pw' } });
  });

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

  it('follows the ice flow: toggle, Save off, reweigh, Save on, tagged', async () => {
    renderPage();
    const weight = await screen.findByLabelText(/Sap weight \(lb\)/);

    // 1. The user enters the original weight. Ice starts off, with nothing to reweigh.
    fireEvent.change(weight, { target: { value: '60' } });
    const ice = screen.getByRole('switch', { name: 'Ice in the bucket' });
    expect(ice.checked).toBe(false);
    expect(screen.queryByLabelText(/Weight after ice removed/)).toBeNull();
    expect(saveButton().disabled).toBe(false);

    // 2. Ice in the bucket: Save greys out, the instructions and the new field appear.
    fireEvent.click(ice);
    expect(saveButton().disabled).toBe(true);
    const steps = within(screen.getByRole('list'));
    expect(steps.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Take the bucket off the sensor.',
      'Remove the ice from the bucket.',
      'Put the bucket back on the sensor.',
      'Enter the new weight in Weight after ice removed.',
    ]);
    expect(screen.getByLabelText(/Weight with ice \(lb\)/)).toBeTruthy();
    const afterIce = screen.getByLabelText(/Weight after ice removed/);

    // A reweigh that is not lighter keeps Save off and says why.
    fireEvent.change(afterIce, { target: { value: '60' } });
    expect(saveButton().disabled).toBe(true);
    expect(screen.getByText(/less than the weight with ice \(60 lb\)/)).toBeTruthy();

    // 3. The new weight, with the ice out, turns Save back on.
    fireEvent.change(afterIce, { target: { value: '45' } });
    expect(saveButton().disabled).toBe(false);

    // 4. Saved with the after-ice weight as the sap, the first weight kept, and tagged.
    fireEvent.click(screen.getByRole('button', { name: 'Save & stop here' }));
    await waitFor(() => expect(screen.getAllByText('Ice removed · reweighed').length).toBeGreaterThan(0));
    const journal = await request({ method: 'GET', path: '/journal' });
    const stored = journal.find((entry) => entry.Weight_Before_Ice_Lb === 60);
    expect(stored, 'the server got both weights').toBeTruthy();
    expect(stored.Weight_Lb).toBe(45);
    await waitFor(() => expect(screen.getByText('60 lb with ice')).toBeTruthy());
  });

  it('turning ice back off drops the reweigh and turns Save on', async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText(/Sap weight \(lb\)/), { target: { value: '60' } });
    const ice = screen.getByRole('switch', { name: 'Ice in the bucket' });
    fireEvent.click(ice);
    fireEvent.change(screen.getByLabelText(/Weight after ice removed/), { target: { value: '45' } });

    fireEvent.click(ice);
    expect(screen.queryByLabelText(/Weight after ice removed/)).toBeNull();
    expect(saveButton().disabled).toBe(false);

    fireEvent.click(ice);
    expect(screen.getByLabelText(/Weight after ice removed/).value).toBe('');
    expect(saveButton().disabled).toBe(true);
  });
});
