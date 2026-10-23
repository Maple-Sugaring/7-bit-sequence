/**
 * Calibrating a load cell from the app.
 *
 * The node only listens for a moment after each packet, so a command waits
 * here until the node's next packet carries it home (pending), is handed to the
 * Pi in an ingest reply (sent), and is settled when a later packet echoes its
 * id back (done or failed). The Pi resends it on every packet until then, so a
 * missed downlink costs one interval, not the command.
 */

export const CALIBRATION_ACTIONS = ['tare', 'calibrate'];

/** The cell is rated 50 to 200 kg; a test weight outside this is a typo. */
export const MIN_TEST_POUNDS = 0.5;
export const MAX_TEST_POUNDS = 400;

const WIRE_ACTION = { tare: 'TARE', calibrate: 'CAL' };

export function isOpen(command) {
  return command?.Status === 'pending' || command?.Status === 'sent';
}

/** What the Pi radios to the node, or null when nothing is waiting. */
export function downlinkFor(command) {
  if (!isOpen(command)) return null;
  const downlink = { Command_Id: command.CommandID, Action: WIRE_ACTION[command.Action] };
  if (command.Action === 'calibrate') downlink.Pounds = Number(command.Pounds);
  return downlink;
}

/** How a reading settles an open command, or null when it says nothing about it. */
export function ackOutcome(command, reading) {
  if (!isOpen(command) || reading?.Command_Id == null) return null;
  if (Number(reading.Command_Id) !== Number(command.CommandID)) return null;
  const ok = Boolean(reading.Command_Ok);
  return {
    status: ok ? 'done' : 'failed',
    countsPerLb: ok && reading.Counts_Per_Lb != null ? Number(reading.Counts_Per_Lb) : null,
  };
}
