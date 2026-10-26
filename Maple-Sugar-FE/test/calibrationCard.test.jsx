// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getCalibration = vi.fn();
const cancelCalibration = vi.fn();
const tareNode = vi.fn();
vi.mock('../src/services/nodeService', async (importOriginal) => ({
  ...(await importOriginal()),
  getCalibration: (...args) => getCalibration(...args),
  cancelCalibration: (...args) => cancelCalibration(...args),
  tareNode: (...args) => tareNode(...args),
}));

const { CalibrationCard } = await import('../src/components/deploy/CalibrationCard');

const NOW = Date.parse('2026-10-26T00:00:40.000Z');
const ago = (seconds) => new Date(NOW - seconds * 1000).toISOString();
const node = { NodeID: 1, Report_Interval_Seconds: 10 };

function calibration({ Command = null, Live = {}, Last_Calibration = null, Last_Scale = null } = {}) {
  return {
    NodeID: 1,
    Report_Interval_Seconds: 10,
    Command,
    Last_Calibration,
    Last_Scale,
    Live: { Weight: 0, Recorded_At: ago(6), Last_Seen: ago(6), Fault: null, ...Live },
  };
}

async function renderWith(data) {
  getCalibration.mockResolvedValue(data);
  render(<CalibrationCard node={node} />);
  await screen.findByText(/Platform reads|No weight/);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  getCalibration.mockReset();
  cancelCalibration.mockReset().mockResolvedValue({});
  tareNode.mockReset().mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('calibration card', () => {
  it('shows a radioed calibrate, what to leave on the platform, and cancels it', async () => {
    await renderWith(
      calibration({
        Command: { CommandID: 10, Action: 'calibrate', Pounds: 16.8, Status: 'sent', Sent_At: ago(40) },
        Live: { Weight: 16.84 },
      }),
    );
    expect(screen.getByText('Platform reads 16.84 lb · 6 s ago')).toBeTruthy();
    expect(screen.getByText('Radioed 40 s ago, on about 5 packets so far.')).toBeTruthy();
    expect(screen.getByText('Keep the 16.8 lb test weight on the platform until the node answers.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(cancelCalibration).toHaveBeenCalledWith(1));
  });

  it("disables tare while the node can't read the load cell, and says why", async () => {
    await renderWith(calibration({ Live: { Fault: { Code: 'load-cell', Description: '', Since: ago(30) } } }));
    expect(screen.getByText(/can't read the load cell/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tare' }).disabled).toBe(true);
  });

  it('warns on an unstable reading without blocking tare', async () => {
    await renderWith(calibration({ Live: { Fault: { Code: 'unstable', Description: '', Since: ago(5) } } }));
    expect(screen.getByText(/last reading was unstable/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tare' }).disabled).toBe(false);
  });

  it('asks for the test weight back instead of a recalibration when the platform reads empty', async () => {
    await renderWith(
      calibration({
        Command: { CommandID: 11, Action: 'calibrate', Pounds: 16.8, Status: 'done', Counts_Per_Lb: 7898, Completed_At: ago(20) },
        Live: { Weight: 0, Recorded_At: ago(5) },
      }),
    );
    expect(screen.getByText(/Put the 16.8 lb test weight back on/)).toBeTruthy();
    expect(screen.queryByText(/Calibrate again/)).toBeNull();
  });

  it('judges the check only on a reading from after the ack', async () => {
    await renderWith(
      calibration({
        Command: { CommandID: 12, Action: 'calibrate', Pounds: 16.8, Status: 'done', Counts_Per_Lb: 7898, Completed_At: ago(20) },
        Live: { Weight: 3.42, Recorded_At: ago(60) },
      }),
    );
    expect(screen.getByText(/Waiting for the next reading to check it/)).toBeTruthy();
    expect(screen.queryByText(/Calibrate again/)).toBeNull();
  });

  it('calls a close reading after the ack good', async () => {
    await renderWith(
      calibration({
        Command: { CommandID: 13, Action: 'calibrate', Pounds: 4.625, Status: 'done', Counts_Per_Lb: 7697, Completed_At: ago(20) },
        Live: { Weight: 4.64, Recorded_At: ago(10) },
      }),
    );
    expect(screen.getByText(/reads 4.64 lb for a 4.625 lb test weight. Calibration is good./)).toBeTruthy();
  });

  it('shows the scale factor the node reports, even with no app calibration', async () => {
    await renderWith(
      calibration({ Last_Scale: { CommandID: 9, Action: 'tare', Status: 'done', Counts_Per_Lb: 7358, Completed_At: ago(300) } }),
    );
    expect(screen.getByText(/The node reports 7358 counts\/lb/)).toBeTruthy();
    expect(screen.queryByText(/datasheet/)).toBeNull();
  });
});
