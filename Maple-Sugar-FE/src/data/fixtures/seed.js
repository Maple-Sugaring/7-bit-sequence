/**
 * Deterministic fixture data shaped exactly like the ER model
 * (ROLES, USERS, GATEWAY, NODE, BUCKETS, METRICS, ALERTS, COLLECTION_LOGS).
 *
 * Field names match the ER diagram so that swapping mockTransport for
 * httpTransport requires no change in the repositories above it.
 */

import dayjs from 'dayjs';

// Seeded LCG: the dashboard must look identical across reloads, otherwise
// every refresh reshuffles the charts and nothing can be eyeballed.
function makeRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const rand = makeRandom(20260311);
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (min, max) => min + rand() * (max - min);
const round = (value, places = 2) => Number(value.toFixed(places));

export const ROLE_ADMIN = 1;
export const ROLE_STUDENT = 2;
export const ROLE_MSS = 3;

export const roles = [
  { RoleID: ROLE_ADMIN, Role_Name: 'Admin' },
  { RoleID: ROLE_STUDENT, Role_Name: 'Student' },
  { RoleID: ROLE_MSS, Role_Name: 'MSS' },
];

export const users = [
  {
    UserID: 1,
    RoleID: ROLE_ADMIN,
    First_Name: 'Tom',
    Last_Name: 'Palmer',
    Email: 'tpalmer@rit.edu',
    Created_At: '2024-01-08',
    Last_Login: '2026-09-11T12:41:00Z',
    Is_Active: true,
    Account_Expiry: null,
    Google_Calendar_ID: 'maple-admin@rit.edu',
  },
  {
    UserID: 2,
    RoleID: ROLE_ADMIN,
    First_Name: 'Dana',
    Last_Name: 'Whitfield',
    Email: 'dwhitfield@rit.edu',
    Created_At: '2024-01-08',
    Last_Login: '2026-09-10T18:02:00Z',
    Is_Active: true,
    Account_Expiry: null,
    Google_Calendar_ID: 'maple-admin@rit.edu',
  },
  {
    UserID: 3,
    RoleID: ROLE_ADMIN,
    First_Name: 'Innocenzio',
    Last_Name: 'Rizzuto',
    Email: 'ir8643@g.rit.edu',
    Created_At: '2026-08-25',
    Last_Login: '2026-09-11T13:15:00Z',
    Is_Active: true,
    Account_Expiry: '2026-12-19',
    Google_Calendar_ID: null,
  },
  {
    UserID: 4,
    RoleID: ROLE_STUDENT,
    First_Name: 'Nolan',
    Last_Name: 'Cooper',
    Email: 'nc4417@g.rit.edu',
    Created_At: '2026-08-25',
    Last_Login: '2026-09-09T15:30:00Z',
    Is_Active: true,
    Account_Expiry: '2026-12-19',
    Google_Calendar_ID: null,
  },
  {
    UserID: 5,
    RoleID: ROLE_ADMIN,
    First_Name: 'Oliver',
    Last_Name: 'Grant',
    Email: 'odg1896@g.rit.edu',
    Created_At: '2026-08-25',
    Last_Login: '2026-09-08T09:12:00Z',
    Is_Active: true,
    Account_Expiry: '2026-12-19',
    Google_Calendar_ID: null,
  },
  {
    UserID: 6,
    RoleID: ROLE_STUDENT,
    First_Name: 'Priya',
    Last_Name: 'Raman',
    Email: 'pr2288@g.rit.edu',
    Created_At: '2025-08-26',
    Last_Login: '2026-05-02T11:00:00Z',
    Is_Active: false,
    Account_Expiry: '2026-05-09',
    Google_Calendar_ID: null,
  },
  {
    UserID: 7,
    RoleID: ROLE_MSS,
    First_Name: 'Ben',
    Last_Name: 'Marino',
    Email: 'bmm8699@g.rit.edu',
    Created_At: '2025-02-14',
    Last_Login: '2026-09-10T16:45:00Z',
    Is_Active: true,
    Account_Expiry: '2027-05-14',
    Google_Calendar_ID: null,
  },
  {
    UserID: 8,
    RoleID: ROLE_MSS,
    First_Name: 'Sofia',
    Last_Name: 'Delgado',
    Email: 'sd9014@g.rit.edu',
    Created_At: '2025-02-14',
    Last_Login: '2026-08-30T14:20:00Z',
    Is_Active: true,
    Account_Expiry: '2027-05-14',
    Google_Calendar_ID: null,
  },
];

export const gateways = [
  {
    GatewayID: 1,
    Gateway_Name: 'Alumni House Pi',
    Last_Seen: '2026-09-11T13:58:00Z',
    Status: 'Online',
  },
  {
    GatewayID: 2,
    Gateway_Name: 'Sugar Shack Pi',
    Last_Seen: '2026-09-11T13:57:00Z',
    Status: 'Online',
  },
  {
    GatewayID: 3,
    Gateway_Name: 'Hill Bottom Relay',
    Last_Seen: '2026-09-11T04:12:00Z',
    Status: 'Offline',
  },
];

// `tempOffset` is a microclimate adjustment in Fahrenheit. A low hollow traps
// warm air on a sunny afternoon while an exposed ridge stays several degrees
// colder, which is why two stands can disagree about whether sap is spoiling.
const STANDS = [
  { name: 'Hill Bottom', gateway: 1, lat: 43.0832, lon: -77.6789, tempOffset: 2 },
  { name: 'Rabbi House', gateway: 1, lat: 43.0847, lon: -77.6801, tempOffset: 0.5 },
  { name: 'Sugar Shack', gateway: 2, lat: 43.0819, lon: -77.6764, tempOffset: -1 },
  { name: 'North Ridge', gateway: 3, lat: 43.0865, lon: -77.6822, tempOffset: -4 },
];

// Status_Code mirrors the firmware enum on the ESP32.
export const NODE_STATUS = {
  0: 'Offline',
  1: 'Online',
  2: 'Degraded',
  3: 'Maintenance',
};

export const nodes = STANDS.flatMap((stand, standIndex) =>
  Array.from({ length: 4 }, (unused, treeIndex) => {
    const id = standIndex * 4 + treeIndex + 1;
    const offline = stand.gateway === 3 && treeIndex > 1;
    const degraded = !offline && rand() < 0.18;

    return {
      NodeID: id,
      LoRa_Device_ID: `E8:9F:6D:${(0x10 + id).toString(16).toUpperCase()}:A2:${(0x40 + id)
        .toString(16)
        .toUpperCase()}`,
      GatewayID: stand.gateway,
      Node_Name: `${stand.name} - Tree ${treeIndex + 1}`,
      Status_Code: offline ? 0 : degraded ? 2 : 1,
      Battery_Percent: round(offline ? between(2, 14) : between(38, 100), 1),
      Signal_Rssi: Math.round(offline ? between(-124, -112) : between(-102, -64)),
      Location: { lat: round(stand.lat + between(-0.0012, 0.0012), 6), lon: round(stand.lon + between(-0.0012, 0.0012), 6) },
      Stand: stand.name,
      Last_Seen: offline
        ? dayjs('2026-09-10T22:00:00Z').subtract(Math.floor(between(1, 30)), 'hour').toISOString()
        : dayjs('2026-09-11T13:55:00Z').subtract(Math.floor(between(0, 20)), 'minute').toISOString(),
    };
  }),
);

export const BUCKET_STATUSES = ['At Tree', 'In Transit', 'Cleaning', 'Storage'];

export const buckets = nodes.map((node, index) => ({
  BucketID: index + 1,
  Barcode_ID: `BKT-${String(index + 1).padStart(3, '0')}`,
  NodeID: node.Status_Code === 0 && rand() < 0.4 ? null : node.NodeID,
  Status: node.Status_Code === 0 ? pick(['Cleaning', 'Storage']) : 'At Tree',
  Tare_Weight: round(between(1.8, 2.6)),
}));

const WEATHER = ['Clear', 'Overcast', 'Snowing', 'Light Rain', 'Partly Cloudy', 'Freezing Fog'];

// Rochester's sap season: the run needs freeze/thaw cycles, so we model an
// ambient curve that dips below freezing overnight and climbs past 40F midday.
// The drift upward over the season is what eventually ends the run.
function ambientTemp(dayOfSeason, hour, seasonWarmth, standOffset = 0) {
  const seasonalDrift = 24 + (dayOfSeason / 40) * 12 + seasonWarmth + standOffset;
  // Phase-shifted so the daily peak lands around 2pm rather than at noon,
  // which keeps the evening reading elevated and the dawn reading below
  // freezing. That freeze/thaw swing is what makes the sap run at all.
  const diurnal = Math.sin(((hour - 8) / 24) * Math.PI * 2) * 11;
  return seasonalDrift + diurnal + between(-2.5, 2.5);
}

const SEASON_STARTS = {
  2024: '2024-02-24',
  2025: '2025-02-21',
  2026: '2026-02-27',
};

// Warmer seasons run shorter and yield less; this is what the year-over-year
// chart is meant to surface.
const SEASON_WARMTH = { 2024: 0, 2025: 2.5, 2026: -1.5 };
const SEASON_LENGTH = { 2024: 38, 2025: 31, 2026: 40 };

function buildMetrics() {
  const rows = [];
  let metricId = 1;
  const offsetByStand = new Map(STANDS.map((stand) => [stand.name, stand.tempOffset]));

  for (const season of [2024, 2025, 2026]) {
    const start = dayjs(SEASON_STARTS[season]);
    const warmth = SEASON_WARMTH[season];

    for (let day = 0; day < SEASON_LENGTH[season]; day += 1) {
      const date = start.add(day, 'day');

      for (const node of nodes) {
        // A node that is offline today was still reporting in past seasons.
        if (season === 2026 && node.Status_Code === 0 && day > SEASON_LENGTH[season] - 6) continue;

        const bucket = buckets.find((b) => b.NodeID === node.NodeID) ?? buckets[0];

        for (const hour of [6, 12, 18]) {
          const temperature = round(
            ambientTemp(day, hour, warmth, offsetByStand.get(node.Stand) ?? 0),
            1,
          );
          // Sap runs on the thaw; flow tracks how far above freezing it got.
          const flowFactor = Math.max(0, Math.min(1, (temperature - 32) / 14));
          const weight = round(bucket.Tare_Weight + flowFactor * between(4, 17), 2);

          rows.push({
            MetricID: metricId++,
            NodeID: node.NodeID,
            BucketID: bucket.BucketID,
            // Null when the ESP32 sent it automatically; set when a student
            // keyed in a refractometer reading.
            Recorded_By_UserID: hour === 12 && rand() < 0.22 ? pick([3, 4, 5]) : null,
            Recorded_At: date.hour(hour).minute(0).second(0).toISOString(),
            Weight: weight,
            Temperature: temperature,
            Sugar_Percent: rand() < 0.34 ? round(between(1.4, 3.4)) : null,
            Weather_Conditions: pick(WEATHER),
          });
        }
      }
    }
  }

  return rows;
}

export const metrics = buildMetrics();

export const ALERT_TYPES = ['Spoilage', 'Tipped', 'Full Bucket', 'Low Battery', 'Node Offline', 'Signal Loss'];

export const alerts = [
  {
    AlertID: 1,
    NodeID: 14,
    Alert_Type: 'Node Offline',
    Description: 'North Ridge - Tree 2 has not reported to Hill Bottom Relay in 9 hours.',
    Created_At: '2026-09-11T04:20:00Z',
    Is_Resolved: false,
  },
  {
    AlertID: 2,
    NodeID: 15,
    Alert_Type: 'Low Battery',
    Description: 'Battery at 6%. Solar charge has not recovered over three days of overcast.',
    Created_At: '2026-09-11T06:05:00Z',
    Is_Resolved: false,
  },
  {
    AlertID: 3,
    NodeID: 3,
    Alert_Type: 'Spoilage',
    Description: 'Sap temperature held above 40F for 5 consecutive hours. Collect or discard.',
    Created_At: '2026-09-11T11:30:00Z',
    Is_Resolved: false,
  },
  {
    AlertID: 4,
    NodeID: 7,
    Alert_Type: 'Full Bucket',
    Description: 'Gross weight 16.8 lb is within 1 lb of overflow. Schedule a collection.',
    Created_At: '2026-09-11T12:10:00Z',
    Is_Resolved: false,
  },
  {
    AlertID: 5,
    NodeID: 9,
    Alert_Type: 'Tipped',
    Description: 'Load cell reported a sudden drop to below tare weight. Probable tipover.',
    Created_At: '2026-09-10T21:44:00Z',
    Is_Resolved: false,
  },
  {
    AlertID: 6,
    NodeID: 2,
    Alert_Type: 'Signal Loss',
    Description: 'LoRa RSSI degraded to -118 dBm. Check antenna seating.',
    Created_At: '2026-09-10T08:15:00Z',
    Is_Resolved: true,
  },
  {
    AlertID: 7,
    NodeID: 5,
    Alert_Type: 'Full Bucket',
    Description: 'Bucket reached capacity during the March 8 run and was emptied.',
    Created_At: '2026-09-08T14:02:00Z',
    Is_Resolved: true,
  },
  {
    AlertID: 8,
    NodeID: 16,
    Alert_Type: 'Node Offline',
    Description: 'North Ridge - Tree 4 unreachable. Gateway relay is also down.',
    Created_At: '2026-09-11T04:22:00Z',
    Is_Resolved: false,
  },
];

function buildCollectionLogs() {
  const rows = [];
  let logId = 1;

  for (const season of [2024, 2025, 2026]) {
    const start = dayjs(SEASON_STARTS[season]);

    for (let day = 2; day < SEASON_LENGTH[season]; day += 3) {
      for (const bucket of buckets) {
        if (rand() > 0.55) continue;

        rows.push({
          LogID: logId++,
          BucketID: bucket.BucketID,
          UserID: pick([3, 4, 5, 6]),
          NodeID: bucket.NodeID ?? nodes[0].NodeID,
          Collected_At: start.add(day, 'day').hour(15).minute(Math.floor(between(0, 59))).toISOString(),
          Volume_Collected: round(between(0.9, 2.4)),
          Quality_Notes: pick(['Clear', 'Clear', 'Slightly cloudy', 'Bark fragments', 'Bug found', '']),
        });
      }
    }
  }

  return rows;
}

export const collectionLogs = buildCollectionLogs();

export const SHIFT_TASKS = ['Sap Collection', 'Sensor Calibration', 'Battery Swap', 'Line Cleaning'];

function buildScheduleSlots() {
  const rows = [];
  let slotId = 1;
  // Anchor to the current week so the schedule always looks live.
  const weekStart = dayjs().startOf('week');

  for (let day = 0; day < 14; day += 1) {
    const date = weekStart.add(day, 'day');
    if (date.day() === 0) continue;

    for (const hour of [8, 13]) {
      const taken = rand() < 0.45;
      const isPast = date.hour(hour).isBefore(dayjs());

      rows.push({
        SlotID: slotId++,
        Task: pick(SHIFT_TASKS),
        Stand: pick(STANDS).name,
        Starts_At: date.hour(hour).minute(0).second(0).toISOString(),
        Ends_At: date.hour(hour + 2).minute(0).second(0).toISOString(),
        Capacity: 2,
        Assigned_UserIDs: taken ? [pick([3, 4, 5])] : [],
        Is_Complete: taken && isPast,
      });
    }
  }

  return rows;
}

export const scheduleSlots = buildScheduleSlots();

export const guides = [
  {
    GuideID: 'install-node',
    Category: 'Installation',
    Title: 'Installing an ESP32 tree node',
    Summary: 'Mount the enclosure, seat the load cell, and register the node with a gateway.',
    Steps: [
      'Pick a trunk section at chest height with no active tap holes within 6 inches.',
      'Strap the IP67 enclosure to the trunk with the cable gland facing down so meltwater drains away.',
      'Hang the bucket from the HX711 load cell hook. Do not let the cable take any of the load.',
      'Run the sensor cable inside the split loom and secure it every 12 inches against squirrel damage.',
      'Power on and confirm the status LED goes solid within 60 seconds, meaning it joined the LoRa mesh.',
      'On the Nodes page, confirm the new LoRa Device ID appears and shows a signal above -100 dBm.',
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
      'Record it on the Record Data page against the correct tree. Raw sap is normally 1.5 to 3 percent.',
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
      'Resolve the Low Battery alert on the Alerts page so it stops escalating.',
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
      'Verify on the Nodes page that last-seen timestamps start advancing again.',
      'If it stays offline past 30 minutes, escalate to an admin.',
    ],
  },
];
