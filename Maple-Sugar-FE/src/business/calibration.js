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

/** The Pi stamps the ack packet a moment before the API settles the command. */
const ACK_CLOCK_SLACK_MS = 3000;

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
  // A newer request also cancels the old one, but then the newer one is the
  // latest, so this label only shows after a cancel from the card.
  cancelled: { open: false, severity: 'warning', label: 'Cancelled. If the node already heard it, it may still apply it.' },
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

/**
 * The last step: does the platform now read the test weight? Right after a
 * calibration the node reads whatever weight was entered, so a reading under
 * half of it means the weight came off, not that the calibration is wrong.
 */
export function calibrationCheck(liveWeight, testPounds) {
  if (liveWeight == null || testPounds == null) return null;
  const off = Number(liveWeight) - Number(testPounds);
  return { off, ok: Math.abs(off) <= CHECK_TOLERANCE_LB, removed: Number(liveWeight) < Number(testPounds) / 2 };
}

/** The live reading, when it was taken with or after the node's ack; else null. */
export function readingAfterAck(command, live) {
  if (!command?.Completed_At || !live?.Recorded_At || live.Weight == null) return null;
  return Date.parse(live.Recorded_At) >= Date.parse(command.Completed_At) - ACK_CLOCK_SLACK_MS ? live : null;
}

export function elapsedLabel(since, now = Date.now()) {
  if (!since) return null;
  const seconds = Math.max(0, Math.round((now - Date.parse(since)) / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min`;
}

/**
 * What the card says while a command is on its way. The Pi hands it to the
 * gateway on every packet until the node answers, and a node can miss a few,
 * so the person sees it is still trying and what to leave on the platform.
 */
export function waitingStatus(command, intervalSeconds, now = Date.now()) {
  if (command?.Status !== 'pending' && command?.Status !== 'sent') return null;
  const hint =
    command.Action === 'tare'
      ? 'Keep the platform empty until the node answers.'
      : `Keep the ${command.Pounds} lb test weight on the platform until the node answers.`;
  if (command.Status === 'pending' || !command.Sent_At) {
    return { label: "Queued. It goes out with the node's next packet.", hint };
  }
  const elapsedMs = Math.max(0, now - Date.parse(command.Sent_At));
  const intervalMs = (intervalSeconds ?? 900) * 1000;
  if (elapsedMs < intervalMs) {
    return { label: 'Radioed to the node with its last packet. Waiting for its answer.', hint };
  }
  const packets = 1 + Math.floor(elapsedMs / intervalMs);
  return { label: `Radioed ${elapsedLabel(command.Sent_At, now)} ago, on about ${packets} packets so far.`, hint };
}

const FAULT = {
  'load-cell': {
    severity: 'error',
    blocksCommands: true,
    text: "The node can't read the load cell, so it can't tare or calibrate. Check the HX711 wiring and power.",
  },
  unstable: {
    severity: 'warning',
    blocksCommands: false,
    text: "The node's last reading was unstable. Keep the platform still until it reads steady.",
  },
  reversed: {
    severity: 'warning',
    blocksCommands: false,
    text: 'The node reads a negative weight. Empty the platform and tare; if it stays negative, the cell is wired backwards.',
  },
  untared: { severity: 'info', blocksCommands: false, text: 'The node has not been tared. Start with Tare.' },
};

/** The card's live line: what the platform reads now, and any fault the node reports. */
export function liveStatus(live, now = Date.now()) {
  if (!live) return { weight: null, fault: null };
  const weight =
    live.Weight == null
      ? 'No weight from the node yet.'
      : `Platform reads ${Number(live.Weight).toFixed(2)} lb · ${elapsedLabel(live.Recorded_At, now)} ago`;
  const fault = live.Fault
    ? (FAULT[live.Fault.Code] ?? {
        severity: 'warning',
        blocksCommands: false,
        text: live.Fault.Description || 'The node is reporting a fault.',
      })
    : null;
  return { weight, fault };
}

export function packetIntervalLabel(seconds) {
  const value = seconds ?? 900;
  if (value % 60 !== 0) return `Every ${value} seconds`;
  const minutes = value / 60;
  return minutes === 1 ? 'Every minute' : `Every ${minutes} minutes`;
}
