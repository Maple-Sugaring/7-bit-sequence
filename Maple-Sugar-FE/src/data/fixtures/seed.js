/**
 * Demo fixture data for mock mode (the sponsor-report branch).
 *
 * This is the app as it will look once the hardware is deployed: three campus
 * sites, four gateways, twelve instrumented trees with a month of weight
 * history, alerts, shifts, journal entries and a populated roster.
 *
 * Field names match the backend response shapes, so swapping mockTransport for
 * httpTransport needs no change in the repositories above it.
 *
 * Every timestamp is computed from the moment the page loads (never a fixed
 * date), so the readings, alerts and shifts always look current. The seeded
 * random generator keeps the weight curves identical across reloads.
 */

import dayjs from 'dayjs';
import { LB_PER_GALLON } from '../../business/yieldMetrics';

function makeRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const rand = makeRandom(20261005);
const between = (min, max) => min + rand() * (max - min);
const round = (value, places = 2) => Number(value.toFixed(places));

const MINUTE = 60_000;
const NOW = Math.floor(Date.now() / MINUTE) * MINUTE;
const at = (minutesFromNow) => new Date(NOW + minutesFromNow * MINUTE).toISOString();
const ago = (minutes) => at(-minutes);
/** An instant `days` whole days ahead, nudged so daysUntilExpiry rounds to `days`. */
const inDays = (days) => at(days * 1440 - 60);
const pad = (value) => String(value).padStart(3, '0');

export const ROLE_ADMIN = 1;
export const ROLE_STUDENT = 2;
export const ROLE_MSS = 3;

export const roles = [
  { RoleID: ROLE_ADMIN, Role_Name: 'Admin' },
  { RoleID: ROLE_STUDENT, Role_Name: 'Student' },
  { RoleID: ROLE_MSS, Role_Name: 'MSS' },
];

// ---- Users ----------------------------------------------------------------
// The first usable account per role becomes a mock login button: Tom Palmer
// (Admin), Maya Okafor (Student) and Sofia Delgado (MSS).

function account(UserID, RoleID, First_Name, Last_Name, Email, extra = {}) {
  return {
    UserID,
    RoleID,
    First_Name,
    Last_Name,
    Email,
    Created_At: '2026-08-25',
    Last_Login: null,
    Is_Active: true,
    Account_Expiry: null,
    Google_Calendar_ID: null,
    ...extra,
  };
}

export const users = [
  account(1, ROLE_ADMIN, 'Tom', 'Palmer', 'tpalmer@rit.edu', {
    Created_At: '2024-01-08',
    Last_Login: ago(95),
    Google_Calendar_ID: 'maple-admin@rit.edu',
    Calendar_Connected: true,
  }),
  account(2, ROLE_ADMIN, 'Dana', 'Whitfield', 'dwhitfield@rit.edu', {
    Created_At: '2024-01-08',
    Last_Login: ago(26 * 60),
    Google_Calendar_ID: 'maple-admin@rit.edu',
    Calendar_Connected: true,
  }),
  account(3, ROLE_ADMIN, 'Innocenzio', 'Rizzuto', 'ir8643@g.rit.edu', { Last_Login: ago(12) }),
  account(4, ROLE_ADMIN, 'Nalin', 'Cooper', 'nic4340@g.rit.edu', { Last_Login: ago(3 * 60) }),
  account(5, ROLE_ADMIN, 'Oliver', 'Gomes', 'odg1896@g.rit.edu', { Last_Login: ago(22 * 60) }),
  // Locked: shows the red "Locked" chip.
  account(6, ROLE_STUDENT, 'Priya', 'Raman', 'pr2288@g.rit.edu', {
    Created_At: '2025-08-26',
    Last_Login: '2026-05-02T11:00:00Z',
    Is_Active: false,
    Account_Expiry: '2026-05-09T23:59:00Z',
  }),
  account(7, ROLE_ADMIN, 'Brandon', 'Maier', 'bmm8699@g.rit.edu', {
    Created_At: '2025-02-14',
    Last_Login: ago(30 * 60),
  }),
  account(8, ROLE_MSS, 'Sofia', 'Delgado', 'sd9014@g.rit.edu', {
    Created_At: '2025-02-14',
    Last_Login: ago(2 * 1440),
    Account_Expiry: inDays(220),
  }),
  account(9, ROLE_ADMIN, 'Ben', 'Arbelo', 'bda9885@g.rit.edu', { Last_Login: ago(5 * 60) }),
  account(10, ROLE_ADMIN, 'Nolan', 'Trapp', 'nlt8375@g.rit.edu', { Last_Login: ago(8 * 60) }),
  account(11, ROLE_ADMIN, 'Darren', 'Yang', 'dy4385@g.rit.edu', { Last_Login: ago(2 * 1440) }),
  account(12, ROLE_STUDENT, 'Maya', 'Okafor', 'mo5521@g.rit.edu', {
    Last_Login: ago(40),
    Account_Expiry: inDays(118),
    Pronouns: 'she/her',
    Calendar_Connected: true,
    Email_Alerts: true,
  }),
  // Expires inside two weeks: warning chip plus the Admin page banner.
  account(13, ROLE_STUDENT, 'Jordan', 'Whitaker', 'jw7342@g.rit.edu', {
    Last_Login: ago(4 * 1440),
    Account_Expiry: inDays(9),
    Pronouns: 'they/them',
  }),
  // Still flagged active but past the end date: red "Expired" chip.
  account(14, ROLE_STUDENT, 'Eli', 'Brandt', 'eb3150@g.rit.edu', {
    Created_At: '2026-01-20',
    Last_Login: ago(9 * 1440),
    Account_Expiry: ago(3 * 1440),
    Pronouns: 'he/him',
  }),
  // Invited but never signed in.
  account(15, ROLE_STUDENT, 'Hannah', 'Cho', 'hc6608@g.rit.edu', {
    Created_At: dayjs().subtract(2, 'day').format('YYYY-MM-DD'),
    Account_Expiry: inDays(120),
    Invite_Pending: true,
    Pronouns: 'she/they',
  }),
  account(16, ROLE_MSS, 'Marcus', 'Lindqvist', 'ml2096@g.rit.edu', {
    Created_At: '2026-02-03',
    Last_Login: ago(6 * 1440),
    Account_Expiry: inDays(300),
    Pronouns: 'he/him',
  }),
];

// ---- Sites, gateways, nodes, buckets ----------------------------------------

// `tempOffset` nudges the forecast per site: the barn sits on an exposed ridge.
const STANDS = [
  { name: 'Alumni House', gatewayId: 1, lat: 43.084, lon: -77.6738, tempOffset: 0 },
  { name: 'Chabad House', gatewayId: 2, lat: 43.0849, lon: -77.6802, tempOffset: -1 },
  { name: 'Red Barn', gatewayId: 3, lat: 43.0897, lon: -77.6688, tempOffset: -3 },
];

export const gateways = [
  {
    GatewayID: 1,
    Gateway_Code: 'GW-ALUMNI',
    Gateway_Name: 'Alumni House Gateway',
    Status: 'Online',
    Last_Seen: ago(1),
  },
  {
    GatewayID: 2,
    Gateway_Code: 'GW-CHABAD',
    Gateway_Name: 'Chabad House Gateway',
    Status: 'Online',
    Last_Seen: ago(2),
  },
  {
    GatewayID: 3,
    Gateway_Code: 'GW-BARN',
    Gateway_Name: 'Red Barn Gateway',
    Status: 'Online',
    Last_Seen: ago(1),
  },
  {
    GatewayID: 4,
    Gateway_Code: 'GW-BENCH',
    Gateway_Name: 'Spare Pi (bench)',
    Status: 'Offline',
    Last_Seen: ago(3 * 1440),
  },
];

// Status_Code mirrors the firmware enum on the Heltec.
export const NODE_STATUS = {
  0: 'Offline',
  1: 'Online',
  2: 'Degraded',
  3: 'Maintenance',
};

// One row per tree. `gal` is the net sap in the bucket right now, `daily` the
// typical gallons it collects per day, and `seen` how many minutes ago its last
// LoRa packet arrived (null: never reported). Together they give every UI
// state at least one example; see the comments on each row.
const NODE_SPECS = [
  { id: 1, stand: 0, status: 1, battery: 87, rssi: -71, seen: 3, gal: 6.2, daily: 1.9, notes: 'South face of the big sugar maple by the east lot.' },
  // Fresh Brix and sap-temperature checks keep running warm: spoilage alert, short shelf life.
  { id: 2, stand: 0, status: 1, battery: 74, rssi: -78, seen: 7, gal: 8.1, daily: 2.3, notes: 'Beside the footpath. Check the spile after wind.' },
  // Net weight past the full-bucket line.
  { id: 3, stand: 0, status: 1, battery: 91, rssi: -66, seen: 5, gal: 9.65, daily: 2.6, notes: 'Heaviest producer on the stand.' },
  // Collected recently.
  { id: 4, stand: 0, status: 1, battery: 68, rssi: -84, seen: 9, gal: 1.1, daily: 1.4, notes: null },
  { id: 5, stand: 1, status: 1, battery: 82, rssi: -74, seen: 4, gal: 4.3, daily: 1.8, notes: 'Behind the fence, easy to reach with the cart.' },
  // Frozen past the 10 gallon line, marked as ice.
  { id: 6, stand: 1, status: 1, battery: 59, rssi: -92, seen: 12, gal: 11.8, daily: 2.2, notes: 'Shaded, so it freezes first.' },
  // Parked for maintenance (split tubing).
  { id: 7, stand: 1, status: 3, battery: 45, rssi: -88, seen: 11, gal: 7.4, daily: 1.6, notes: 'Tubing split near the tap.' },
  // Low battery, weak link, missed readings.
  { id: 8, stand: 1, status: 2, battery: 14, rssi: -108, seen: 34, gal: 2.9, daily: 1.2, notes: 'Panel is shaded by the neighbouring pine.' },
  { id: 9, stand: 2, status: 1, battery: 77, rssi: -90, seen: 2, gal: 5.0, daily: 1.7, notes: null },
  // Tipped over about six hours ago, then set upright.
  { id: 10, stand: 2, status: 1, battery: 63, rssi: -97, seen: 6, gal: 0.4, daily: 1.5, tipAt: 380, notes: 'Windy corner of the barn.' },
  // Dead battery: offline since last night.
  { id: 11, stand: 2, status: 0, battery: 3, rssi: -121, seen: 560, gal: 5.8, daily: 1.5, notes: null },
  // Registered but never reported yet.
  { id: 12, stand: 2, status: 0, battery: null, rssi: null, seen: null, notes: 'Newly registered. Waiting for the first packet.' },
];

export const nodes = NODE_SPECS.map((spec) => {
  const stand = STANDS[spec.stand];
  const tree = ((spec.id - 1) % 4) + 1;

  return {
    NodeID: spec.id,
    Node_Code: `NODE-${pad(spec.id)}`,
    LoRa_Device_ID: `E8:9F:6D:${(0x10 + spec.id).toString(16).toUpperCase()}:A2:${(0x40 + spec.id)
      .toString(16)
      .toUpperCase()}`,
    GatewayID: stand.gatewayId,
    Node_Name: `${stand.name} - Tree ${tree}`,
    Stand: stand.name,
    Location: {
      lat: round(stand.lat + (tree - 2.5) * 0.00022, 6),
      lon: round(stand.lon + ((spec.id % 3) - 1) * 0.00028, 6),
    },
    Rf_Tag: spec.id === 12 ? null : `RF-${1100 + spec.id}`,
    Notes: spec.notes,
    Status_Code: spec.status,
    Battery_Percent: spec.battery,
    Signal_Rssi: spec.rssi,
    Last_Seen: spec.seen == null ? null : ago(spec.seen),
    Report_Interval_Seconds: 900,
    Tracked: true,
  };
});

export const BUCKET_STATUSES = ['At Tree', 'In Transit', 'Cleaning', 'Storage'];

const TARES = NODE_SPECS.map(() => round(between(1.9, 2.6)));

export const buckets = [
  ...NODE_SPECS.map((spec, index) => ({
    BucketID: spec.id,
    Barcode_ID: `BKT-${pad(spec.id)}`,
    NodeID: spec.id,
    Status: 'At Tree',
    Tare_Weight: TARES[index],
  })),
  { BucketID: 13, Barcode_ID: 'BKT-013', NodeID: null, Status: 'Storage', Tare_Weight: 2.1 },
  { BucketID: 14, Barcode_ID: 'BKT-014', NodeID: null, Status: 'Cleaning', Tare_Weight: 2.3 },
];

// ---- Readings --------------------------------------------------------------

// Sap only runs on the thaw. Each day gets its own strength, with an
// occasional cold day that barely moves.
const DAY_FACTORS = Array.from({ length: 32 }, (unused, day) =>
  day % 9 === 4 ? between(0.05, 0.2) : between(0.55, 1.45),
);

/** Gallons per hour entering a bucket `minutesAgo`, peaking mid-afternoon Eastern. */
function flowPerHour(minutesAgo, daily) {
  const time = new Date(NOW - minutesAgo * MINUTE);
  const hour = time.getUTCHours() + time.getUTCMinutes() / 60;
  // Positive from 12:00 to 24:00 UTC (8 AM to 8 PM Eastern), peak at 18:00 UTC.
  const shape = Math.sin(((hour - 12) / 24) * 2 * Math.PI);
  if (shape <= 0) return 0;
  const day = DAY_FACTORS[Math.floor(minutesAgo / 1440) % DAY_FACTORS.length];
  // 7.64 is the area under the positive half of the sine, in hours.
  return (daily * day * shape) / 7.64;
}

/** Minutes ago of each packet, newest first: every 15 min for 48 h, hourly before. */
function packetTimes(lastSeen) {
  const times = [];
  let minutes = lastSeen;
  for (; minutes <= 48 * 60; minutes += 15) times.push(minutes);
  for (minutes += 45; minutes <= 30 * 1440; minutes += 60) times.push(minutes);
  return times;
}

const COLLECTORS = [12, 3, 12, 4, 12, 5, 13, 12, 1];
const LITERS_PER_GALLON = 3.785;

/**
 * Builds a node's weight history backwards from where its bucket stands now.
 * Walking back in time, a bucket that would have gone empty was collected at
 * that moment, so it jumps back up to a plausible full level. That produces
 * the sawtooth a real bucket draws, ending exactly on `spec.gal`.
 */
function simulate(spec, tare) {
  const times = packetTimes(spec.seen);
  const packets = [];
  const collections = [];
  let gallons = spec.gal;
  let tipped = false;

  for (let index = 0; index < times.length; index += 1) {
    const newer = times[index];
    const older = times[index + 1];
    let rate = 0;
    let before = gallons;

    if (older != null) {
      const hours = (older - newer) / 60;
      rate = flowPerHour((older + newer) / 2, spec.daily);
      before = gallons - rate * hours;

      if (spec.tipAt && !tipped && older > spec.tipAt) {
        tipped = true;
        before = between(2.8, 3.6);
      } else if (before < 0.05) {
        before = between(5.4, 9.7);
        collections.push({ ago: older - 3, gross: round(tare + before * LB_PER_GALLON, 1) });
      }
    }

    const lph = rate * LITERS_PER_GALLON;
    packets.push({
      ago: newer,
      weight: round(tare + gallons * LB_PER_GALLON + (rand() - 0.5) * 0.08, 2),
      lph: lph < 0.05 ? null : round(lph, 1),
    });
    gallons = before;
  }

  return { packets, collections };
}

function sensorRow(spec, packet) {
  return {
    NodeID: spec.id,
    BucketID: spec.id,
    // Hardware never sends a user, temperature or sugar; air temperature comes
    // from the weather service and Brix is keyed in at collection.
    Recorded_By_UserID: null,
    Recorded_At: ago(packet.ago),
    Weight: packet.weight,
    Temperature: null,
    Sugar_Percent: null,
    Weather_Conditions: null,
    Ice_Present: false,
    Sap_Flow_Rate_Lph: packet.lph,
  };
}

function manualRow({ node, minutes, user, weight, temp = null, sugar = null, ice = false, weather = null }) {
  return {
    NodeID: node,
    BucketID: node,
    Recorded_By_UserID: user,
    Recorded_At: ago(minutes),
    Weight: weight,
    Temperature: temp,
    Sugar_Percent: sugar,
    Weather_Conditions: weather,
    Ice_Present: ice,
    Sap_Flow_Rate_Lph: null,
  };
}

// Hand-placed Brix and sap-temperature checks. The `minutes: 1` rows are the
// newest reading for their tree, which is what puts the sugar, sap
// temperature and shelf-life lines on its dashboard card.
const CHECKS = [
  // Tree 2 has run warm for 20 hours: spoilage alert and a short shelf life.
  { node: 2, minutes: 1, user: 12, temp: 46, sugar: 2.6 },
  { node: 2, minutes: 300, user: 12, temp: 45 },
  { node: 2, minutes: 540, user: 4, temp: 44, sugar: 2.5 },
  { node: 2, minutes: 840, user: 12, temp: 43 },
  { node: 2, minutes: 1200, user: 3, temp: 47, sugar: 2.4 },
  { node: 3, minutes: 1, user: 12, temp: 43, sugar: 2.9 },
  { node: 3, minutes: 600, user: 4, temp: 41, sugar: 2.8 },
  { node: 5, minutes: 1, user: 13, temp: 35, sugar: 2.2 },
  // Tree 6: frozen solid, marked as ice.
  { node: 6, minutes: 1, user: 5, temp: 31, sugar: 2.0, ice: true },
  { node: 1, minutes: 300, user: 12, temp: 37, sugar: 2.7 },
  // The extremes of the sugar band: lean sap and rich sap.
  { node: 9, minutes: 360, user: 5, temp: 36, sugar: 1.2 },
  { node: 10, minutes: 1560, user: 4, temp: 38, sugar: 3.8 },
];

const sensorByNode = new Map();
const readingRows = [];
const collectionEvents = [];

NODE_SPECS.forEach((spec, index) => {
  if (spec.seen == null) return;
  const { packets, collections } = simulate(spec, TARES[index]);
  sensorByNode.set(spec.id, packets);
  packets.forEach((packet) => readingRows.push(sensorRow(spec, packet)));
  collections.forEach((event) => collectionEvents.push({ ...event, node: spec.id }));
});

function weightNear(node, minutes) {
  const packets = sensorByNode.get(node);
  const nearest = packets.reduce((best, packet) =>
    Math.abs(packet.ago - minutes) < Math.abs(best.ago - minutes) ? packet : best,
  );
  return round(nearest.weight + 0.1, 1);
}

CHECKS.forEach((check) => {
  readingRows.push(
    manualRow({ ...check, weight: weightNear(check.node, check.minutes), weather: 'Brix check' }),
  );
});

// Newest collections first, each credited to one of the regular collectors.
collectionEvents.sort((a, b) => a.ago - b.ago);
collectionEvents.forEach((event, index) => {
  event.user = COLLECTORS[index % COLLECTORS.length];
  readingRows.push(
    manualRow({
      node: event.node,
      minutes: event.ago,
      user: event.user,
      weight: event.gross,
      temp: round(between(33, 44), 0),
      sugar: index % 5 === 0 ? null : round(between(1.5, 3.4), 1),
      ice: index % 8 === 3,
      weather: 'Collected',
    }),
  );
});

readingRows.sort((a, b) => a.Recorded_At.localeCompare(b.Recorded_At));
export const metrics = readingRows.map((row, index) => ({ MetricID: index + 1, ...row }));

// ---- Collection journal ------------------------------------------------------

const JOURNAL_NOTES = [
  'Sap ran clear and cold. Emptied into the carboys and hauled to the sugar shack.',
  'Slight bark fragments. Strained through cheesecloth before pouring.',
  'Spile was dripping steadily and the lid was still tight. Nothing to fix.',
  'Lid was rattling in the wind. Re-seated it and checked the spile.',
  'Steady drip all afternoon. Bucket was close to full when we got there.',
  'Sap smelled slightly sweet and looked a touch cloudy. Collected and iced right away.',
  'Cart wheel stuck in the mud near the fence. Took two trips.',
];

function nodeName(id) {
  return nodes.find((node) => node.NodeID === id)?.Node_Name ?? null;
}

function author(userId) {
  const user = users.find((candidate) => candidate.UserID === userId);
  return user ? `${user.First_Name} ${user.Last_Name}`.trim() : null;
}

const recentCollections = collectionEvents.slice(0, 14);

const journalRows = recentCollections.map((event, index) => {
  const iced = index % 8 === 3;
  const notes = JOURNAL_NOTES[index % JOURNAL_NOTES.length];
  return {
    UserID: event.user,
    Author: author(event.user),
    NodeID: event.node,
    Node_Name: nodeName(event.node),
    BucketID: event.node,
    Collected_At: ago(event.ago),
    Title: `Collected ${nodeName(event.node)}`,
    Process_Notes:
      index === 5 ? `Batch B.\n${notes}\nPoured into the second carboy.` : iced ? `Ice in the bucket. ${notes}` : notes,
    Weight_Lb: index % 6 === 2 ? null : event.gross,
    Sugar_Percent: index % 5 === 0 ? null : round(between(1.6, 3.3), 1),
    Ice_Present: iced,
  };
});

// Entries that are not tied to one tree.
journalRows.push(
  {
    UserID: 12,
    Author: author(12),
    NodeID: null,
    Node_Name: null,
    BucketID: null,
    Collected_At: ago(31 * 60),
    Title: 'Evaporator run',
    Process_Notes:
      'Batch A.\nBoiled 32 gallons of sap from Alumni House down to a little under a gallon of syrup. Filtered while hot.',
    Weight_Lb: null,
    Sugar_Percent: null,
    Ice_Present: false,
  },
  {
    UserID: 4,
    Author: author(4),
    NodeID: null,
    Node_Name: null,
    BucketID: null,
    Collected_At: ago(52 * 60),
    Title: 'Washed the spare buckets',
    Process_Notes: 'Scrubbed and sanitized BKT-013 and BKT-014 so there are clean swaps on hand.',
    Weight_Lb: null,
    Sugar_Percent: null,
    Ice_Present: false,
  },
);

journalRows.sort((a, b) => a.Collected_At.localeCompare(b.Collected_At));
export const journal = journalRows.map((row, index) => ({ EntryID: index + 1, ...row }));

export const collectionLogs = journal
  .filter((entry) => entry.NodeID != null && entry.Weight_Lb != null)
  .map((entry, index) => ({
    LogID: index + 1,
    BucketID: entry.BucketID,
    UserID: entry.UserID,
    NodeID: entry.NodeID,
    Collected_At: entry.Collected_At,
    Volume_Collected: round(Math.max(0, entry.Weight_Lb - TARES[entry.NodeID - 1]) / LB_PER_GALLON, 1),
    Quality_Notes: entry.Process_Notes.split('\n').at(-1),
  }));

// ---- Alerts ----------------------------------------------------------------

export const ALERT_TYPES = [
  'Spoilage',
  'Tipped',
  'Full Bucket',
  'Collection Needed',
  'Low Battery',
  'Node Offline',
  'Missed Readings',
  'Signal Loss',
  'Sap Run',
  'Hard Freeze',
  'Extreme Cold',
  'Heavy Precipitation',
  'Flagged',
];

// [node, type, description, minutes ago, resolved]. NodeID null is a
// sugarbush-wide weather alert. Anything open for 30+ minutes counts as
// escalated; the 5, 22 and 25 minute ones show the not-yet-escalated state.
const ALERT_SPECS = [
  [3, 'Full Bucket', 'Net sap is 9.7 gal, at the 10 gallon bucket capacity. Schedule a collection before it overflows.', 22, false],
  [8, 'Low Battery', 'Battery at 14%. The panel has been in shade for three days.', 3 * 60, false],
  [11, 'Node Offline', 'No packet in 9 hours. Battery was at 3% on its last report.', 540, false],
  [8, 'Missed Readings', 'Two report intervals have passed without a packet. Last heard 34 minutes ago.', 5, false],
  [8, 'Signal Loss', 'LoRa RSSI degraded to -108 dBm. Check antenna seating.', 50, false],
  [2, 'Spoilage', 'Sap temperature held above 40F for 5 consecutive hours. Collect or discard.', 95, false],
  [10, 'Tipped', 'Load cell reported a sudden drop to below tare weight. Probable tipover.', 380, false],
  [6, 'Collection Needed', 'The bucket froze past the 10 gallon line at 11.8 gal. Collect and thaw before pouring.', 60, false],
  [7, 'Flagged', 'Flagged for review: tubing split near the tap. Parked in maintenance until it is replaced.', 120, false],
  [null, 'Sap Run', 'Sap run building. A low of 26F and a high of 42F should move about 0.73 gal per tree, up from the last reading.', 25, false],
  [null, 'Hard Freeze', 'Overnight low of 18F. Check lines and spiles for ice damage.', 5 * 60, false],
  [1, 'Full Bucket', 'Bucket reached capacity and was emptied on the afternoon run.', 30 * 60, true],
  [2, 'Signal Loss', 'LoRa RSSI degraded to -112 dBm. Antenna reseated, link recovered.', 26 * 60, true],
  [9, 'Low Battery', 'Battery at 12%. Swapped for a charged pack.', 2 * 1440, true],
  [5, 'Spoilage', 'Sap temperature held above 40F for 4 consecutive hours. Collected and iced.', 2 * 1440 + 180, true],
  [null, 'Sap Run', 'Sap run holding. Freeze-thaw is in place (24F to 41F), about 0.83 gal per tree.', 30 * 60 + 15, true],
  [null, 'Extreme Cold', 'Low of 5F overnight. Sap flow paused.', 3 * 1440, true],
  [null, 'Heavy Precipitation', 'More than half an inch of rain expected. Check the lids on every bucket.', 3 * 1440 + 300, true],
];

export const alerts = ALERT_SPECS.map(([NodeID, Alert_Type, Description, minutes, Is_Resolved]) => ({
  NodeID,
  Alert_Type,
  Description,
  Created_At: ago(minutes),
  Is_Resolved,
}))
  .sort((a, b) => a.Created_At.localeCompare(b.Created_At))
  .map((alert, index) => ({ AlertID: index + 1, ...alert }))
  .reverse();

const alertIdFor = (NodeID, type) =>
  alerts.find((alert) => alert.NodeID === NodeID && alert.Alert_Type === type)?.AlertID ?? null;

// ---- Schedule ----------------------------------------------------------------

export const SHIFT_TASKS = ['Sap Collection', 'Maintenance', 'Sensor Check', 'Battery Swap'];

function slot({ day, hour = 8, hours = 2, task, stand, capacity = 2, users: assigned = [], complete = false, bucketIds, alertId = null, nodeId = null, notes = '', awaiting = false }) {
  const start = dayjs().startOf('day').add(day ?? 0, 'day').hour(hour);
  return {
    Task: task,
    Stand: stand,
    Starts_At: awaiting ? null : start.toISOString(),
    Ends_At: awaiting ? null : start.add(hours, 'hour').toISOString(),
    Capacity: capacity,
    Assigned_UserIDs: assigned,
    Is_Complete: complete,
    Alert_ID: alertId,
    Node_ID: nodeId,
    Notes: notes,
    Bucket_IDs: bucketIds,
    Bucket_Labels: bucketIds.map((id) => `BKT-${pad(id)}`),
    Awaiting_Time: awaiting,
  };
}

// Maya (12) is the Student demo login, Tom (1) the Admin one. The rows cover
// every state the schedule can show: finished, past and unclaimed, past and
// not ticked off, today, open, part-filled, full, mine, overlapping, and
// waiting for a time.
const SLOT_SPECS = [
  slot({ day: -9, hour: 8, task: 'Sap Collection', stand: 'Alumni House', users: [12, 3], complete: true, bucketIds: [1, 2] }),
  slot({ day: -8, hour: 13, task: 'Sap Collection', stand: 'Chabad House', users: [4], complete: true, bucketIds: [5, 6] }),
  slot({ day: -7, hour: 8, task: 'Sensor Check', stand: 'Red Barn', capacity: 1, users: [5], complete: true, bucketIds: [9] }),
  slot({ day: -6, hour: 13, task: 'Battery Swap', stand: 'Alumni House', capacity: 1, users: [3], complete: true, bucketIds: [4] }),
  slot({ day: -5, hour: 8, task: 'Sap Collection', stand: 'Alumni House', users: [12], complete: true, bucketIds: [1, 2, 3] }),
  slot({ day: -4, hour: 13, task: 'Maintenance', stand: 'Chabad House', capacity: 1, users: [1], complete: true, bucketIds: [7] }),
  slot({ day: -3, hour: 8, task: 'Sap Collection', stand: 'Red Barn', users: [13, 5], complete: true, bucketIds: [9, 10] }),
  slot({ day: -2, hour: 8, task: 'Sap Collection', stand: 'Chabad House', bucketIds: [5, 6] }),
  slot({ day: -2, hour: 13, task: 'Sap Collection', stand: 'Alumni House', users: [12], complete: true, bucketIds: [1, 2] }),
  // Past, assigned, not ticked off yet: an admin can mark it complete.
  slot({ day: -1, hour: 8, task: 'Sap Collection', stand: 'Alumni House', users: [12, 4], bucketIds: [1, 2, 3, 4] }),
  slot({ day: -1, hour: 13, task: 'Sensor Check', stand: 'Chabad House', capacity: 1, users: [3], complete: true, bucketIds: [8] }),
  slot({ day: 0, hour: 8, task: 'Sap Collection', stand: 'Alumni House', users: [12], bucketIds: [1, 2, 3] }),
  slot({ day: 0, hour: 13, task: 'Maintenance', stand: 'Red Barn', users: [1], bucketIds: [9, 10] }),
  slot({ day: 0, hour: 16, task: 'Battery Swap', stand: 'Chabad House', capacity: 1, users: [3], bucketIds: [8] }),
  slot({ day: 1, hour: 8, task: 'Sap Collection', stand: 'Chabad House', bucketIds: [5, 6, 7] }),
  slot({ day: 1, hour: 13, task: 'Sap Collection', stand: 'Red Barn', users: [12], bucketIds: [9, 10] }),
  // Overlaps Maya's Red Barn shift, so she sees why she cannot claim it.
  slot({ day: 1, hour: 13, task: 'Sensor Check', stand: 'Alumni House', users: [4], bucketIds: [2] }),
  // Full: capacity 1, already taken.
  slot({ day: 2, hour: 8, task: 'Battery Swap', stand: 'Red Barn', capacity: 1, users: [5], bucketIds: [11], nodeId: 11 }),
  // Two people on it, Maya among them.
  slot({ day: 2, hour: 13, task: 'Sap Collection', stand: 'Alumni House', users: [12, 13], bucketIds: [1, 2, 3] }),
  slot({
    day: 3,
    hour: 9,
    task: 'Maintenance',
    stand: 'Chabad House',
    bucketIds: [7],
    nodeId: 7,
    alertId: alertIdFor(7, 'Flagged'),
    notes: 'Replace the split tubing at the tap, then mark the tree online.',
  }),
  slot({ day: 4, hour: 8, task: 'Sap Collection', stand: 'Alumni House', users: [3, 1], bucketIds: [1, 2] }),
  slot({ day: 6, hour: 13, task: 'Sensor Check', stand: 'Chabad House', bucketIds: [8], nodeId: 8 }),
  slot({ day: 8, hour: 8, task: 'Sap Collection', stand: 'Red Barn', bucketIds: [9, 10] }),
  // Raised from an alert, waiting for someone to pick a time.
  slot({
    awaiting: true,
    task: 'Sensor Check',
    stand: 'Chabad House',
    capacity: 1,
    bucketIds: [8],
    nodeId: 8,
    alertId: alertIdFor(8, 'Signal Loss'),
    notes: 'Reseat the antenna on Chabad House - Tree 4 and confirm the signal.',
  }),
  slot({
    awaiting: true,
    task: 'Battery Swap',
    stand: 'Red Barn',
    capacity: 1,
    bucketIds: [11],
    nodeId: 11,
    alertId: alertIdFor(11, 'Node Offline'),
    notes: 'Swap the Li-ion pack on Red Barn - Tree 3. It dropped off the network last night.',
  }),
];

export const scheduleSlots = SLOT_SPECS.sort((a, b) => {
  if (!a.Starts_At || !b.Starts_At) return a.Starts_At ? -1 : b.Starts_At ? 1 : 0;
  return a.Starts_At.localeCompare(b.Starts_At);
}).map((row, index) => ({ SlotID: index + 1, ...row }));

// ---- Live weather ------------------------------------------------------------

// A freeze-thaw run for the week ahead. October would not really run sap, so
// this is a deliberate demo scenario. Day 1 is a cold, icy one and day 5 is the
// warm spell that shuts the run down.
const FORECAST_DAYS = [
  { low: 26, high: 42, precip: 0, conditions: 'partly cloudy' },
  { low: 22, high: 33, precip: 0, conditions: 'clear sky' },
  { low: 18, high: 38, precip: 0, conditions: 'clear sky' },
  { low: 22, high: 47, precip: 0.2, conditions: 'light rain' },
  { low: 30, high: 48, precip: 0, conditions: 'overcast clouds' },
  { low: 36, high: 55, precip: 0, conditions: 'sky is clear' },
];

/** Mirrors sapRunFromTemps in Maple-Sugar-BE/src/business/sapFlow.js. */
function modelSapRun({ low, high, precip }) {
  const sapRun = low < 32 && high > 32;
  const ice = high <= 34 && low <= 28;
  let flow = 0;
  if (sapRun) {
    const thaw = Math.min(1.4, Math.max(0, high - 32) / 14);
    const freeze = Math.min(1.4, Math.max(0, 32 - low) / 16);
    flow = Math.min(2.6, 0.25 + thaw * freeze * 1.8);
    if (precip > 0.15 && high > 33) flow = Math.min(2.8, flow * 1.12);
    if (high >= 55) flow *= 0.55;
    if (ice) flow *= 0.65;
    flow = Math.round(flow * 100) / 100;
  }
  return { sapRun, ice, flow, index: Math.round(Math.min(1, flow / 2.6) * 1000) / 1000 };
}

function sapSummary(day, run) {
  return run.sapRun
    ? `Sap run building. A low of ${day.low}F and a high of ${day.high}F should move about ${run.flow} gal per tree, up from the last reading.`
    : `No sap run. The low is ${day.low}F and the high is ${day.high}F, without a freeze followed by a thaw.`;
}

/** Built per request so the current temperature follows the time of day. */
export function buildLiveWeather() {
  const hour = new Date().getHours() + new Date().getMinutes() / 60;

  const sites = STANDS.map((stand) => {
    const days = FORECAST_DAYS.map((day) => ({
      ...day,
      low: day.low + stand.tempOffset,
      high: day.high + stand.tempOffset,
    }));
    const forecast = days.map((day, offset) => {
      const run = modelSapRun(day);
      return {
        Date: dayjs().add(offset, 'day').format('YYYY-MM-DD'),
        Temp_Min_F: day.low,
        Temp_Max_F: day.high,
        Precip_In: day.precip,
        Conditions: day.conditions,
        Sap_Run: run.sapRun,
        Flow_Index: run.index,
        Flow_Gal: run.flow,
        Ice_Present: run.ice,
      };
    });
    const today = days[0];
    const run = modelSapRun(today);
    const middle = (today.low + today.high) / 2;
    const swing = (today.high - today.low) / 2;

    return {
      Name: stand.name,
      Latitude: stand.lat,
      Longitude: stand.lon,
      Temperature_F: round(middle + swing * Math.sin(((hour - 9) / 24) * 2 * Math.PI), 1),
      Temp_Min_F: today.low,
      Temp_Max_F: today.high,
      Description: today.conditions,
      Sap_Run: run.sapRun,
      Flow_Gal: run.flow,
      Summary: sapSummary(today, run),
      Forecast: forecast,
    };
  });

  const [primary] = sites;
  const run = modelSapRun({
    low: primary.Temp_Min_F,
    high: primary.Temp_Max_F,
    precip: FORECAST_DAYS[0].precip,
  });

  return {
    Configured: true,
    Location_Label: 'RIT campus',
    Latitude: primary.Latitude,
    Longitude: primary.Longitude,
    Sites: sites,
    Observed_At: new Date().toISOString(),
    Temperature_F: primary.Temperature_F,
    Temp_Min_F: primary.Temp_Min_F,
    Temp_Max_F: primary.Temp_Max_F,
    Conditions: 'Clouds',
    Description: primary.Description,
    Sap_Run: primary.Sap_Run,
    Flow_Index: run.index,
    Flow_Gal: primary.Flow_Gal,
    Ice_Present: run.ice,
    Flow_Change: 'up',
    Summary: primary.Summary,
    Forecast: primary.Forecast,
  };
}

// ---- Guides ------------------------------------------------------------------

export const guides = [
  {
    GuideID: 'install-node',
    Category: 'Installation',
    Title: 'Installing a Heltec tree node',
    Summary: 'Mount the enclosure, seat the load cell, and register the node with a gateway.',
    Steps: [
      'Pick a trunk section at chest height with no active tap holes within 6 inches.',
      'Strap the IP67 enclosure to the trunk with the cable gland facing down so meltwater drains away.',
      'Hang the bucket from the HX711 load cell hook. Do not let the cable take any of the load.',
      'Run the sensor cable inside the split loom and secure it every 12 inches against squirrel damage.',
      'Power on and confirm the status LED goes solid within 60 seconds, meaning it joined the LoRa mesh.',
      'On the Deploy page, confirm the new node appears and shows a signal above -100 dBm.',
    ],
  },
  {
    GuideID: 'calibrate-loadcell',
    Category: 'Calibration',
    Title: 'Calibrating the HX711 load cell',
    Summary: 'Zero the tare and verify against a known weight. Required once per season.',
    Steps: [
      'Remove the bucket entirely and let the reading settle for 30 seconds.',
      'Hold the calibration button for 3 seconds. The LED double-blinks when the zero point is stored.',
      'Hang the empty bucket and record the displayed value as the tare weight.',
      'Hang the 5 kg reference weight and confirm the reading is within 50 g.',
      'If it is outside tolerance, repeat the zero step. Buckets are swappable without recalibration, so only recalibrate the cell itself.',
      'Enter the tare weight on the bucket record so yield math subtracts the right amount.',
    ],
  },
  {
    GuideID: 'refractometer',
    Category: 'Collection',
    Title: 'Taking a Brix reading with the refractometer',
    Summary: 'Manual sugar content measurement to pair with an automated weight reading.',
    Steps: [
      'Rinse the prism with distilled water and dry it with the lens cloth. Residue skews the reading high.',
      'Let the sap sample reach roughly the same temperature as the refractometer.',
      'Place two or three drops on the prism and close the cover plate with no air bubbles.',
      'Read the value at the boundary line against a light source.',
      'Record it on the Collection page against the correct tree. Raw sap is normally 1.5 to 3 percent.',
      'Rinse and dry the prism again before the next tree to avoid carryover.',
    ],
  },
  {
    GuideID: 'solar-maintenance',
    Category: 'Maintenance',
    Title: 'Clearing a solar panel and checking battery health',
    Summary: 'What to do when a node reports low battery during an overcast stretch.',
    Steps: [
      'Brush snow and ice off the panel face with the soft brush. Never scrape with a tool.',
      'Check the panel is still angled south at roughly 45 degrees.',
      'Inspect the connector for green corrosion and reseat it until it clicks.',
      'Open the enclosure only if the interior desiccant pack has turned pink, then swap the pack.',
      'If the battery stays under 20 percent after a full sunny day, swap in a charged Li-ion pack.',
      'Resolve the Low Battery alert on the Notifications page so it stops escalating.',
    ],
  },
  {
    GuideID: 'gateway-recovery',
    Category: 'Maintenance',
    Title: 'Recovering an offline Raspberry Pi gateway',
    Summary: 'Steps to take when every node behind one gateway goes dark at once.',
    Steps: [
      'Confirm the whole stand is offline rather than one node. That points at the gateway, not the trees.',
      'Check the gateway has power and that the UPS is not running on battery.',
      'Power cycle the Pi and wait two full minutes for the LoRa service to come back.',
      'Buffered readings on the node SD cards upload automatically once the mesh reforms. Do not clear them.',
      'Verify on the Deploy page that last-seen timestamps start advancing again.',
      'If it stays offline past 30 minutes, escalate to an admin.',
    ],
  },
];
