/**
 * Calibrating a load cell from the app (tare, then a known test weight).
 *
 * The command reaches the node on its next packet and the result comes back on
 * the packet after, so every step takes about one packet interval. The API
 * keeps the same limits in Maple-Sugar-BE/src/business/calibration.js.
 */

export const MIN_TEST_POUNDS = 0.5;
export const MAX_TEST_POUNDS = 400;

/** How close the live weight must land to the test weight to call it good. */
export const CHECK_TOLERANCE_LB = 0.2;

export function testWeightError(value) {
  const pounds = Number(value);
  if (value === '' || value == null || !Number.isFinite(pounds)) return 'Enter the test weight in pounds.';
  if (pounds < MIN_TEST_POUNDS) return `Use a test weight of at least ${MIN_TEST_POUNDS} lb.`;
  if (pounds > MAX_TEST_POUNDS) return `Use a test weight of ${MAX_TEST_POUNDS} lb or less.`;
  return null;
}

const STATE = {
  pending: { open: true, severity: 'info', label: 'Waiting for the node to check in.' },
  sent: { open: true, severity: 'info', label: 'Radioed to the node. Waiting for its answer.' },
  done: { open: false, severity: 'success' },
  failed: { open: false, severity: 'error' },
  cancelled: { open: false, severity: 'warning', label: 'Replaced by a newer request.' },
};

export function commandState(command) {
  if (!command) return { open: false, severity: 'info', label: 'Nothing sent yet.' };
  const state = STATE[command.Status] ?? STATE.pending;
  if (command.Status === 'done') {
    return {
      ...state,
      label: command.Action === 'tare' ? 'Tared. The empty platform now reads 0 lb.' : 'Calibrated with the test weight.',
    };
  }
  if (command.Status === 'failed') {
    return {
      ...state,
      label:
        command.Action === 'tare'
          ? 'The node could not tare. Check the load cell wiring.'
          : 'The node did not see the test weight. Tare with the platform empty, then try again.',
    };
  }
  return state;
}

/** The last step: does the platform now read the test weight? */
export function calibrationCheck(liveWeight, testPounds) {
  if (liveWeight == null || testPounds == null) return null;
  const off = Number(liveWeight) - Number(testPounds);
  return { off, ok: Math.abs(off) <= CHECK_TOLERANCE_LB };
}

export function packetIntervalLabel(seconds) {
  const value = seconds ?? 900;
  if (value % 60 !== 0) return `Every ${value} seconds`;
  const minutes = value / 60;
  return minutes === 1 ? 'Every minute' : `Every ${minutes} minutes`;
}
