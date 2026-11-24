import { netFromGross } from './collectionRound';
import { weightAfterIceError } from './validation';

/**
 * The reweigh of an iced bucket.
 *
 * With ice tagged, the student takes the bucket off the sensor, removes the
 * ice, puts it back, and turns the node off and on. A node sends its first
 * reading a few seconds after it powers up, so the form watches for a reading
 * newer than the one it had when ice was tagged and fills in the weight after
 * ice removed. If none comes within a minute, the collection is saved with the
 * last reading (the weight on the form, which the sensor's last reading filled
 * in unless the student corrected it) and flagged as not reweighed.
 */

/** How long the form waits for the node's reading after ice is tagged. */
export const REWEIGH_WAIT_MS = 60_000;

/** How often the form looks for that reading while it waits. */
export const REWEIGH_POLL_MS = 5_000;

const time = (value) => {
  const ms = value == null ? NaN : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};

/**
 * The node's new reading as the weight after ice removed, in pounds of sap, or
 * null while there is none to use.
 *
 * Only a reading newer than `baselineAt` (the node's last reading when ice was
 * tagged; the phone's clock when there was none) counts, and only one that
 * looks like the bucket back on the sensor with the ice out: lighter than the
 * first weight and above the empty bucket. A scheduled report taken with the
 * bucket still off, or the ice still in, is skipped and the form keeps waiting.
 */
export function reweighFromReading(node, { baselineAt, iceAt, firstWeight, tareLb = 0 }) {
  if (!node || node.Weight == null || node.Status_Code === 0) return null;
  const readAt = time(node.Recorded_At);
  const since = time(baselineAt) ?? time(iceAt);
  if (readAt == null || since == null || readAt <= since) return null;

  const net = netFromGross(node.Weight, tareLb);
  if (net == null) return null;
  const weight = net.toFixed(1);
  if (weightAfterIceError(weight, firstWeight, 0)) return null;
  return { weight, recordedAt: node.Recorded_At };
}

/**
 * Where the reweigh stands:
 * - `off`: no ice tagged.
 * - `reweighed`: a weight after ice removed is in, from the sensor or typed.
 * - `waiting`: inside the minute, looking for the node's reading.
 * - `timed-out`: the minute passed with no reading; it saves flagged.
 */
export function reweighStatus({ ice, weightAfterIce, iceAt, now = Date.now() }) {
  if (!ice) return 'off';
  if (weightAfterIce !== '' && weightAfterIce != null) return 'reweighed';
  const started = time(iceAt);
  if (started == null || now - started >= REWEIGH_WAIT_MS) return 'timed-out';
  return 'waiting';
}
