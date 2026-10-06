import dayjs from 'dayjs';
import { ApiError } from '../ApiError';
import { Capability, ROLE_LABELS, can, roleFromId } from '../../business/permissions';
import * as seed from '../fixtures/seed';

/**
 * In-memory stand-in for the Express API. Routes and payload shapes match what
 * the backend is specified to expose, so switching VITE_API_MODE to `http` is
 * the only change needed once the real service exists.
 */

// Cloned so mutations during a session do not leak back into the fixtures.
const db = {
  roles: structuredClone(seed.roles),
  users: structuredClone(seed.users),
  gateways: structuredClone(seed.gateways),
  nodes: structuredClone(seed.nodes),
  buckets: structuredClone(seed.buckets),
  metrics: structuredClone(seed.metrics),
  alerts: structuredClone(seed.alerts),
  collectionLogs: structuredClone(seed.collectionLogs),
  scheduleSlots: structuredClone(seed.scheduleSlots),
  journal: structuredClone(seed.journal),
  guides: structuredClone(seed.guides),
};

// A reduce, not Math.max(...ids): the readings table is large enough that
// spreading it into arguments is wasteful, and an empty table must not give -Infinity.
const maxId = (rows, key) => rows.reduce((max, row) => Math.max(max, row[key] ?? 0), 0);

let nextId = {
  metric: maxId(db.metrics, 'MetricID') + 1,
  alert: maxId(db.alerts, 'AlertID') + 1,
  user: maxId(db.users, 'UserID') + 1,
  slot: maxId(db.scheduleSlots, 'SlotID') + 1,
  log: maxId(db.collectionLogs, 'LogID') + 1,
  journal: maxId(db.journal, 'EntryID') + 1,
};

let session = null;

// Enough delay that loading skeletons are visible during development without
// making the app feel broken.
const LATENCY_MS = 180;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function notFound(resource) {
  throw new ApiError(`${resource} not found.`, { status: 404, code: 'NOT_FOUND' });
}

/** A gateway is placed by both coordinates or by neither. */
function hasPoint(body) {
  return body?.Latitude != null && body?.Longitude != null && body.Latitude !== '' && body.Longitude !== '';
}

function invalid(message, details) {
  throw new ApiError(message, { status: 422, code: 'VALIDATION', details });
}

/**
 * After a full reload the in-memory session is gone but AuthProvider restores
 * the UI from localStorage, so fall back to that stored user.
 */
function currentUser() {
  if (!session) {
    try {
      const stored = JSON.parse(window.localStorage.getItem('maple-sugar-session'));
      const restored = stored && db.users.find((row) => row.UserID === stored.user?.id);
      if (restored) session = { token: stored.token, user: restored };
    } catch {
      // No storage (tests, private mode): stay signed out.
    }
  }
  const user = session && db.users.find((row) => row.UserID === session.user.UserID);
  if (!user) throw new ApiError('Sign in to continue.', { status: 401, code: 'BAD_CREDENTIALS' });
  return user;
}

/** currentUser for writes that only stamp an author: null instead of a 401. */
function signedInUser() {
  try {
    return currentUser();
  } catch {
    return null;
  }
}

/**
 * Same shape as GET /profile. The demo shows the app as deployed, so mail is
 * on and the admin's test email succeeds; see POST /notifications/test.
 */
function profileOf(user) {
  const role = roleFromId(user.RoleID);
  return {
    ...user,
    Pronouns: user.Pronouns ?? null,
    Email_Alerts: user.Email_Alerts ?? user.RoleID === 1,
    Email_Shifts: user.Email_Shifts ?? true,
    Role_Label: ROLE_LABELS[role] ?? role,
    Can_Receive_Alerts: can(role, Capability.VIEW_ALERTS),
    Mail_Enabled: true,
  };
}

function seasonOf(isoDate) {
  const date = dayjs(isoDate);
  // A sap season is named for the calendar year it runs in; anything after
  // June belongs to the following year's season planning.
  return date.month() >= 6 ? date.year() + 1 : date.year();
}

function withinRange(isoDate, from, to) {
  if (from && dayjs(isoDate).isBefore(dayjs(from))) return false;
  if (to && dayjs(isoDate).isAfter(dayjs(to))) return false;
  return true;
}

/**
 * Mirrors the backend's slot query, which resolves each assignment to a display
 * name so the schedule view does not need the admin-only user roster. Kept in
 * sync with mapScheduleSlot's Assignees field.
 */
function withAssignees(slot) {
  const assignees = slot.Assigned_UserIDs.map((id) => {
    const user = db.users.find((candidate) => candidate.UserID === id);
    return {
      userId: id,
      name: user ? `${user.First_Name} ${user.Last_Name}`.trim() : `User ${id}`,
      email: user?.Email ?? null,
      pronouns: user?.Pronouns ?? null,
    };
  });
  return { ...slot, Assignees: assignees, Awaiting_Time: slot.Awaiting_Time ?? !slot.Starts_At };
}

/**
 * One row per tracked node: its bucket plus its newest reading, whoever sent
 * it. Same fields and ordering as the backend's listBoard query, so The Bush,
 * the tree page, Sugar Woods, Collection and Schedule Admin all read it.
 */
function boardRows() {
  const latest = new Map();
  for (const row of db.metrics) {
    const known = latest.get(row.NodeID);
    if (!known || Date.parse(row.Recorded_At) > Date.parse(known.Recorded_At)) {
      latest.set(row.NodeID, row);
    }
  }

  return db.nodes
    .filter((node) => node.Tracked)
    .map((node) => {
      const bucket = db.buckets.find((candidate) => candidate.NodeID === node.NodeID) ?? null;
      const reading = latest.get(node.NodeID) ?? null;
      return {
        NodeID: node.NodeID,
        Node_Name: node.Node_Name,
        Stand: node.Stand,
        Status_Code: node.Status_Code,
        Battery_Percent: node.Battery_Percent ?? null,
        Signal_Rssi: node.Signal_Rssi ?? null,
        Last_Seen: node.Last_Seen ?? null,
        Node_Code: node.Node_Code ?? null,
        Report_Interval_Seconds: node.Report_Interval_Seconds ?? null,
        Location: node.Location ?? null,
        Rf_Tag: node.Rf_Tag ?? null,
        Notes: node.Notes ?? null,
        BucketID: bucket?.BucketID ?? null,
        Barcode_ID: bucket?.Barcode_ID ?? null,
        Tare_Weight: bucket?.Tare_Weight ?? null,
        Bucket_Status: bucket?.Status ?? null,
        Weight: reading?.Weight ?? null,
        Temperature: reading?.Temperature ?? null,
        Sugar_Percent: reading?.Sugar_Percent ?? null,
        Sap_Flow_Rate_Lph: reading?.Sap_Flow_Rate_Lph ?? null,
        Ice_Present: Boolean(reading?.Ice_Present),
        Recorded_At: reading?.Recorded_At ?? null,
      };
    })
    .sort((a, b) => String(a.Stand).localeCompare(String(b.Stand)) || a.NodeID - b.NodeID);
}

/** Display name for a journal author, matching what the backend joins in. */
function authorName(user) {
  return user ? `${user.First_Name} ${user.Last_Name}`.trim() : null;
}

const routes = [
  // ---- Auth -------------------------------------------------------------
  {
    method: 'POST',
    match: /^\/auth\/login$/,
    handler: (unused, { body }) => {
      const user = db.users.find(
        (candidate) => candidate.Email.toLowerCase() === String(body?.email ?? '').toLowerCase(),
      );

      if (!user) {
        throw new ApiError('No account matches that email address.', {
          status: 401,
          code: 'BAD_CREDENTIALS',
        });
      }
      if (!body?.password) {
        throw new ApiError('Password is required.', { status: 401, code: 'BAD_CREDENTIALS' });
      }
      if (!user.Is_Active) {
        throw new ApiError(
          'This account has expired. Ask an administrator to grant an extension.',
          { status: 403, code: 'ACCOUNT_EXPIRED' },
        );
      }

      user.Last_Login = dayjs().toISOString();
      session = { token: `mock-token-${user.UserID}`, user };
      return session;
    },
  },
  {
    method: 'POST',
    match: /^\/auth\/logout$/,
    handler: () => {
      session = null;
      return null;
    },
  },
  {
    method: 'GET',
    match: /^\/auth\/session$/,
    handler: () => session,
  },

  // ---- Reference data ---------------------------------------------------
  { method: 'GET', match: /^\/roles$/, handler: () => db.roles },
  { method: 'GET', match: /^\/gateways$/, handler: () => db.gateways },
  {
    method: 'POST',
    match: /^\/gateways$/,
    handler: (_match, { body }) => {
      const gateway = {
        GatewayID: Math.max(0, ...db.gateways.map((item) => item.GatewayID)) + 1,
        Gateway_Code: body?.Gateway_Code,
        Gateway_Name: body?.Gateway_Name,
        Status: 'Offline',
        Last_Seen: null,
        Notes: body?.Notes || null,
        Location: hasPoint(body) ? { lat: Number(body.Latitude), lon: Number(body.Longitude) } : null,
      };
      db.gateways.push(gateway);
      return gateway;
    },
  },
  {
    method: 'PATCH',
    match: /^\/gateways\/(\d+)$/,
    handler: ([id], { body }) => {
      const gateway = db.gateways.find((candidate) => candidate.GatewayID === Number(id));
      if (!gateway) notFound('Gateway');
      const code = body?.Gateway_Code;
      if (code && db.gateways.some((other) => other !== gateway && other.Gateway_Code === code)) {
        invalid('That record already exists.');
      }
      if (code) gateway.Gateway_Code = code;
      if (body?.Gateway_Name) gateway.Gateway_Name = body.Gateway_Name;
      if ('Notes' in (body ?? {})) gateway.Notes = body.Notes || null;
      if ('Latitude' in (body ?? {}) || 'Longitude' in (body ?? {})) {
        gateway.Location = hasPoint(body) ? { lat: Number(body.Latitude), lon: Number(body.Longitude) } : null;
      }
      return gateway;
    },
  },
  {
    method: 'DELETE',
    match: /^\/gateways\/(\d+)$/,
    handler: ([id]) => {
      const index = db.gateways.findIndex((candidate) => candidate.GatewayID === Number(id));
      if (index < 0) notFound('Gateway');
      db.gateways.splice(index, 1);
      for (const node of db.nodes) if (node.GatewayID === Number(id)) node.GatewayID = null;
      return null;
    },
  },
  { method: 'GET', match: /^\/buckets$/, handler: () => db.buckets },
  { method: 'GET', match: /^\/guides$/, handler: () => db.guides },

  // ---- Nodes ------------------------------------------------------------
  { method: 'GET', match: /^\/nodes$/, handler: () => db.nodes },
  { method: 'GET', match: /^\/nodes\/board$/, handler: () => boardRows() },
  {
    method: 'GET',
    match: /^\/nodes\/board$/,
    // The real board joins each node to its bucket and latest reading.
    handler: () =>
      db.nodes.map((node) => {
        const bucket = db.buckets.find((item) => item.NodeID === node.NodeID);
        return { ...node, BucketID: bucket?.BucketID ?? null, Barcode_ID: bucket?.Barcode_ID ?? null };
      }),
  },
  {
    method: 'POST',
    match: /^\/nodes$/,
    handler: (_match, { body }) => {
      const id = Math.max(0, ...db.nodes.map((node) => node.NodeID)) + 1;
      const node = {
        NodeID: id,
        Node_Code: `NODE-${String(id).padStart(3, '0')}`,
        GatewayID: body?.GatewayID ? Number(body.GatewayID) : null,
        Node_Name: body?.Node_Name ?? `Tree ${id}`,
        Stand: body?.Stand ?? '',
        Location: { lat: Number(body?.Latitude), lon: Number(body?.Longitude) },
        Rf_Tag: body?.Rf_Tag || null,
        Notes: body?.Notes || null,
        Status_Code: 0,
        Tracked: true,
        Battery_Percent: null,
        Signal_Rssi: null,
        Last_Seen: null,
        Report_Interval_Seconds: 900,
      };
      db.nodes.push(node);

      // The backend gives every new node a bucket so it can be weighed.
      const bucketId = Math.max(0, ...db.buckets.map((item) => item.BucketID)) + 1;
      db.buckets.push({
        BucketID: bucketId,
        Barcode_ID: `BKT-${String(bucketId).padStart(3, '0')}`,
        NodeID: id,
        Status: 'At Tree',
        Tare_Weight: Number(body?.Tare_Weight) > 0 ? Number(body.Tare_Weight) : 2.2,
      });
      return node;
    },
  },
  {
    method: 'POST',
    match: /^\/nodes\/(\d+)\/actions$/,
    handler: ([id], { body }) => {
      const node = db.nodes.find((candidate) => candidate.NodeID === Number(id));
      if (!node) notFound('Node');

      if (body?.Action === 'maintenance') {
        node.Status_Code = 3;
        return node;
      }
      if (body?.Action === 'online') {
        node.Status_Code = 1;
        return node;
      }
      if (body?.Action !== 'collect') invalid('Choose collect, maintenance or online.');

      // Collecting empties the bucket: a reading at tare weight, a journal
      // note, and any open "needs collecting" alerts for this tree close.
      const bucket = db.buckets.find((candidate) => candidate.NodeID === node.NodeID) ?? null;
      const tare = bucket?.Tare_Weight ?? 2;
      const user = signedInUser();
      const now = dayjs().toISOString();

      db.metrics.push({
        MetricID: nextId.metric++,
        NodeID: node.NodeID,
        BucketID: bucket?.BucketID ?? null,
        Recorded_By_UserID: user?.UserID ?? null,
        Recorded_At: now,
        Weight: tare,
        Temperature: null,
        Sugar_Percent: null,
        Weather_Conditions: 'Collected',
        Ice_Present: false,
        Sap_Flow_Rate_Lph: null,
      });
      db.journal.push({
        EntryID: nextId.journal++,
        UserID: user?.UserID ?? null,
        Author: authorName(user),
        NodeID: node.NodeID,
        Node_Name: node.Node_Name,
        BucketID: bucket?.BucketID ?? null,
        Collected_At: now,
        Title: `Collected ${node.Node_Name}`,
        Process_Notes: String(body?.Notes ?? '').trim() || 'Bucket emptied from the bush dashboard.',
        Weight_Lb: tare,
        Sugar_Percent: null,
        Ice_Present: false,
      });
      for (const alert of db.alerts) {
        if (
          alert.NodeID === node.NodeID &&
          !alert.Is_Resolved &&
          ['Full Bucket', 'Collection Needed'].includes(alert.Alert_Type)
        ) {
          alert.Is_Resolved = true;
        }
      }
      return node;
    },
  },
  {
    method: 'DELETE',
    match: /^\/nodes\/(\d+)$/,
    handler: ([id]) => {
      const index = db.nodes.findIndex((node) => node.NodeID === Number(id));
      if (index < 0) notFound('Node');
      db.nodes.splice(index, 1);
      return null;
    },
  },
  {
    method: 'GET',
    match: /^\/nodes\/(\d+)$/,
    handler: ([id]) =>
      db.nodes.find((node) => node.NodeID === Number(id)) ?? notFound('Node'),
  },
  {
    method: 'PATCH',
    match: /^\/nodes\/(\d+)\/details$/,
    handler: ([id], { body }) => {
      const node = db.nodes.find((candidate) => candidate.NodeID === Number(id));
      if (!node) notFound('Node');
      node.Node_Name = body?.Node_Name ?? node.Node_Name;
      node.Stand = body?.Stand ?? node.Stand;
      if (body?.GatewayID !== undefined) node.GatewayID = body.GatewayID ? Number(body.GatewayID) : null;
      node.Location = { lat: Number(body?.Latitude), lon: Number(body?.Longitude) };
      node.Rf_Tag = body?.Rf_Tag || null;
      node.Notes = body?.Notes || null;
      return node;
    },
  },
  {
    method: 'PATCH',
    match: /^\/nodes\/(\d+)\/interval$/,
    handler: ([id], { body }) => {
      const node = db.nodes.find((candidate) => candidate.NodeID === Number(id));
      if (!node) notFound('Node');
      node.Report_Interval_Seconds = Number(body?.Report_Interval_Minutes) * 60;
      return node;
    },
  },
  {
    method: 'PATCH',
    match: /^\/nodes\/(\d+)$/,
    handler: ([id], { body }) => {
      const node = db.nodes.find((candidate) => candidate.NodeID === Number(id));
      if (!node) notFound('Node');
      Object.assign(node, body);
      return node;
    },
  },
  {
    method: 'POST',
    match: /^\/nodes\/(\d+)\/flag$/,
    handler: ([id], { body }) => {
      const node = db.nodes.find((candidate) => candidate.NodeID === Number(id));
      if (!node) notFound('Node');

      const alert = {
        AlertID: nextId.alert++,
        NodeID: node.NodeID,
        Alert_Type: body?.type ?? 'Flagged',
        Description: body?.description ?? `${node.Node_Name} flagged for review.`,
        Created_At: dayjs().toISOString(),
        Is_Resolved: false,
      };
      db.alerts.unshift(alert);
      return alert;
    },
  },

  // ---- Metrics ----------------------------------------------------------
  {
    method: 'GET',
    match: /^\/metrics$/,
    handler: (unused, { query }) => {
      const { nodeId, season, from, to } = query ?? {};

      return db.metrics.filter((row) => {
        if (nodeId && row.NodeID !== Number(nodeId)) return false;
        if (season && seasonOf(row.Recorded_At) !== Number(season)) return false;
        return withinRange(row.Recorded_At, from, to);
      });
    },
  },
  {
    method: 'POST',
    match: /^\/metrics$/,
    handler: (unused, { body }) => {
      if (!body?.NodeID) invalid('A tree must be selected.', { NodeID: 'required' });

      const node = db.nodes.find((candidate) => candidate.NodeID === Number(body.NodeID));
      if (!node) notFound('Node');

      const row = {
        MetricID: nextId.metric++,
        NodeID: Number(body.NodeID),
        BucketID: body.BucketID ? Number(body.BucketID) : null,
        Recorded_By_UserID: signedInUser()?.UserID ?? null,
        Recorded_At: body.Recorded_At ?? dayjs().toISOString(),
        Weight: body.Weight != null ? Number(body.Weight) : null,
        Temperature: body.Temperature != null ? Number(body.Temperature) : null,
        Sugar_Percent: body.Sugar_Percent != null ? Number(body.Sugar_Percent) : null,
        Weather_Conditions: body.Weather_Conditions ?? null,
        Ice_Present: Boolean(body.Ice_Present),
      };

      db.metrics.push(row);
      return row;
    },
  },
  {
    method: 'PATCH',
    match: /^\/metrics\/(\d+)$/,
    handler: ([id], { body }) => {
      const row = db.metrics.find((candidate) => candidate.MetricID === Number(id));
      if (!row) notFound('Reading');
      Object.assign(row, body);
      return row;
    },
  },

  // ---- Alerts -----------------------------------------------------------
  {
    method: 'GET',
    match: /^\/alerts$/,
    handler: (unused, { query }) => {
      if (query?.resolved === 'false') return db.alerts.filter((alert) => !alert.Is_Resolved);
      if (query?.resolved === 'true') return db.alerts.filter((alert) => alert.Is_Resolved);
      return db.alerts;
    },
  },
  {
    method: 'PATCH',
    match: /^\/alerts\/(\d+)$/,
    handler: ([id], { body }) => {
      const alert = db.alerts.find((candidate) => candidate.AlertID === Number(id));
      if (!alert) notFound('Alert');
      Object.assign(alert, body);
      return alert;
    },
  },

  // ---- Collection logs --------------------------------------------------
  {
    method: 'GET',
    match: /^\/collection-logs$/,
    handler: (unused, { query }) => {
      const { season, from, to } = query ?? {};
      return db.collectionLogs.filter((row) => {
        if (season && seasonOf(row.Collected_At) !== Number(season)) return false;
        return withinRange(row.Collected_At, from, to);
      });
    },
  },
  {
    method: 'POST',
    match: /^\/collection-logs$/,
    handler: (unused, { body }) => {
      const row = {
        LogID: nextId.log++,
        BucketID: Number(body.BucketID),
        UserID: signedInUser()?.UserID ?? null,
        NodeID: Number(body.NodeID),
        Collected_At: body.Collected_At ?? dayjs().toISOString(),
        Volume_Collected: Number(body.Volume_Collected),
        Quality_Notes: body.Quality_Notes ?? '',
      };
      db.collectionLogs.push(row);
      return row;
    },
  },

  // ---- Users ------------------------------------------------------------
  { method: 'GET', match: /^\/users$/, handler: () => db.users },
  {
    method: 'POST',
    match: /^\/users\/invite$/,
    handler: (unused, { body }) => {
      const email = String(body?.email ?? '').trim();
      if (!email) invalid('An email address is required.', { email: 'required' });
      if (db.users.some((user) => user.Email.toLowerCase() === email.toLowerCase())) {
        invalid('That email already has an account.', { email: 'duplicate' });
      }

      const [localPart] = email.split('@');
      const user = {
        UserID: nextId.user++,
        RoleID: Number(body.roleId ?? seed.ROLE_STUDENT),
        First_Name: body.firstName ?? localPart,
        Last_Name: body.lastName ?? '',
        Email: email,
        Created_At: dayjs().format('YYYY-MM-DD'),
        Last_Login: null,
        Is_Active: true,
        Account_Expiry: body.accountExpiry ?? dayjs().add(4, 'month').format('YYYY-MM-DD'),
        Google_Calendar_ID: null,
        Invite_Pending: true,
      };
      db.users.push(user);
      return user;
    },
  },
  {
    method: 'PATCH',
    match: /^\/users\/(\d+)$/,
    handler: ([id], { body }) => {
      const user = db.users.find((candidate) => candidate.UserID === Number(id));
      if (!user) notFound('User');
      Object.assign(user, body);
      return user;
    },
  },
  {
    method: 'DELETE',
    match: /^\/users\/(\d+)$/,
    handler: ([id]) => {
      const index = db.users.findIndex((candidate) => candidate.UserID === Number(id));
      if (index === -1) notFound('User');
      db.users.splice(index, 1);
      return null;
    },
  },

  // ---- Schedule ---------------------------------------------------------
  {
    method: 'GET',
    match: /^\/schedule\/slots$/,
    handler: (unused, { query }) =>
      db.scheduleSlots
        .filter((slot) => withinRange(slot.Starts_At, query?.from, query?.to))
        .map(withAssignees),
  },
  {
    method: 'POST',
    match: /^\/schedule\/slots$/,
    handler: (unused, { body }) => {
      if (!body?.Task) invalid('Name the task.');
      if (!Array.isArray(body?.BucketIDs) || body.BucketIDs.length === 0) {
        invalid('Choose at least one bucket.');
      }
      if (!body?.Starts_At || !body?.Ends_At) invalid('Pick a start and an end.');
      if (Date.parse(body.Ends_At) <= Date.parse(body.Starts_At)) {
        invalid('The shift must end after it starts.');
      }

      const buckets = body.BucketIDs.map((id) => {
        const bucket = db.buckets.find((item) => item.BucketID === Number(id));
        if (!bucket) invalid('One of those buckets is not on a tree.');
        const node = db.nodes.find((item) => item.NodeID === bucket.NodeID);
        return { bucket, node };
      });
      const stands = [...new Set(buckets.map((item) => item.node?.Stand).filter(Boolean))];
      const assigned = [];
      if (body.UserID) {
        const user = db.users.find((candidate) => candidate.UserID === Number(body.UserID));
        if (!user) invalid('Choose a student who already has an account.');
        assigned.push(user.UserID);
      }

      const slot = {
        SlotID: nextId.slot++,
        Task: body.Task,
        Stand: stands.join(', ') || 'Sugarbush',
        Starts_At: body.Starts_At,
        Ends_At: body.Ends_At,
        Capacity: Number(body.Capacity) > 0 ? Number(body.Capacity) : 1,
        Assigned_UserIDs: assigned,
        Is_Complete: false,
        Alert_ID: body.AlertID ?? null,
        Node_ID: buckets[0].node?.NodeID ?? null,
        Notes: body.Notes ?? '',
        Bucket_IDs: body.BucketIDs.map(Number),
        Bucket_Labels: buckets.map((item) => item.bucket.Barcode_ID),
        Awaiting_Time: false,
      };
      db.scheduleSlots.push(slot);
      return withAssignees(slot);
    },
  },
  {
    method: 'PATCH',
    match: /^\/schedule\/slots\/(\d+)$/,
    handler: ([id], { body }) => {
      const slot = db.scheduleSlots.find((candidate) => candidate.SlotID === Number(id));
      if (!slot) notFound('Shift');
      Object.assign(slot, body);
      return withAssignees(slot);
    },
  },
  {
    method: 'DELETE',
    match: /^\/schedule\/slots\/(\d+)$/,
    handler: ([id]) => {
      const index = db.scheduleSlots.findIndex((candidate) => candidate.SlotID === Number(id));
      if (index === -1) notFound('Shift');
      db.scheduleSlots.splice(index, 1);
      return null;
    },
  },
  {
    method: 'POST',
    match: /^\/schedule\/slots\/(\d+)\/signup$/,
    handler: ([id], { body }) => {
      const slot = db.scheduleSlots.find((candidate) => candidate.SlotID === Number(id));
      if (!slot) notFound('Shift');

      const userId = Number(body?.userId ?? signedInUser()?.UserID);
      if (!userId) invalid('No user to sign up.');

      if (slot.Assigned_UserIDs.includes(userId)) {
        invalid('You are already signed up for this shift.');
      }
      if (slot.Assigned_UserIDs.length >= slot.Capacity) {
        invalid('This shift is already full.');
      }

      // Double-booking guard: the same person cannot hold two overlapping
      // shifts even across different stands.
      const overlapping = db.scheduleSlots.find(
        (other) =>
          other.SlotID !== slot.SlotID &&
          other.Assigned_UserIDs.includes(userId) &&
          dayjs(other.Starts_At).isBefore(dayjs(slot.Ends_At)) &&
          dayjs(other.Ends_At).isAfter(dayjs(slot.Starts_At)),
      );
      if (overlapping) {
        invalid(`That overlaps your ${overlapping.Task} shift at ${overlapping.Stand}.`);
      }

      slot.Assigned_UserIDs.push(userId);
      return withAssignees(slot);
    },
  },
  {
    method: 'POST',
    match: /^\/schedule\/slots\/(\d+)\/withdraw$/,
    handler: ([id], { body }) => {
      const slot = db.scheduleSlots.find((candidate) => candidate.SlotID === Number(id));
      if (!slot) notFound('Shift');

      const userId = Number(body?.userId ?? signedInUser()?.UserID);
      slot.Assigned_UserIDs = slot.Assigned_UserIDs.filter((assigned) => assigned !== userId);
      return withAssignees(slot);
    },
  },
  {
    method: 'GET',
    match: /^\/schedule\/availability$/,
    // Open two-hour windows over the next four days, labelled the way the
    // backend labels them ("Tue, Oct 6 · 8:00 AM – 10:00 AM").
    handler: () => ({
      Time_Zone: 'America/New_York',
      Busy: [],
      Windows: [1, 2, 3, 4].flatMap((offset) =>
        [8, 14].map((hour) => {
          const start = dayjs().add(offset, 'day').hour(hour).minute(0).second(0).millisecond(0);
          const end = start.add(2, 'hour');
          return {
            Starts_At: start.toISOString(),
            Ends_At: end.toISOString(),
            Label: `${start.format('ddd, MMM D')} · ${start.format('h:mm A')} – ${end.format('h:mm A')}`,
          };
        }),
      ),
    }),
  },
  {
    method: 'POST',
    match: /^\/schedule\/slots\/(\d+)\/claim-time$/,
    handler: ([id], { body }) => {
      const slot = db.scheduleSlots.find((candidate) => candidate.SlotID === Number(id));
      if (!slot) notFound('Shift');
      slot.Starts_At = body.Starts_At;
      slot.Ends_At = body.Ends_At;
      slot.Awaiting_Time = false;
      const userId = signedInUser()?.UserID;
      if (userId && !slot.Assigned_UserIDs.includes(userId)) slot.Assigned_UserIDs.push(userId);
      return withAssignees(slot);
    },
  },
  {
    method: 'GET',
    match: /^\/weather\/daily$/,
    handler: () => ({
      Station: null,
      Note: 'Mock mode has no historic station file.',
      Days: [],
    }),
  },
  {
    method: 'GET',
    match: /^\/weather\/live$/,
    handler: () => seed.buildLiveWeather(),
  },
  {
    // Like the backend: admins read every note, students only their own, and
    // MSS members (who cannot record collections) get none.
    method: 'GET',
    match: /^\/journal$/,
    handler: () => {
      const user = signedInUser();
      if (!user || user.RoleID === seed.ROLE_MSS) return [];

      return db.journal
        .filter((entry) => user.RoleID === seed.ROLE_ADMIN || entry.UserID === user.UserID)
        .sort((a, b) => Date.parse(b.Collected_At) - Date.parse(a.Collected_At));
    },
  },
  {
    method: 'POST',
    match: /^\/journal$/,
    handler: (unused, { body }) => {
      const user = signedInUser();
      const node = body?.NodeID ? db.nodes.find((item) => item.NodeID === Number(body.NodeID)) : null;

      const entry = {
        EntryID: nextId.journal++,
        UserID: user?.UserID ?? null,
        Author: authorName(user),
        NodeID: node?.NodeID ?? null,
        Node_Name: node?.Node_Name ?? null,
        BucketID: body?.BucketID ? Number(body.BucketID) : null,
        Collected_At: body?.Collected_At ?? dayjs().toISOString(),
        Title: body?.Title || (node ? `Collected ${node.Node_Name}` : 'Collection note'),
        Process_Notes: body?.Process_Notes ?? '',
        Weight_Lb: body?.Weight ?? null,
        Sugar_Percent: body?.Sugar_Percent ?? null,
        Ice_Present: Boolean(body?.Ice_Present),
      };
      db.journal.push(entry);
      return entry;
    },
  },
  {
    method: 'GET',
    match: /^\/profile$/,
    handler: () => profileOf(currentUser()),
  },
  {
    method: 'PATCH',
    match: /^\/profile$/,
    handler: (unused, { body }) => {
      const user = currentUser();
      if (body?.First_Name !== undefined && !String(body.First_Name).trim()) {
        invalid('Enter your first name.', { First_Name: 'required' });
      }
      for (const key of ['First_Name', 'Last_Name', 'Pronouns', 'Email_Alerts', 'Email_Shifts']) {
        if (body?.[key] !== undefined) user[key] = body[key];
      }
      session.user = user;
      return profileOf(user);
    },
  },
  {
    method: 'POST',
    match: /^\/notifications\/test$/,
    // The demo has mail "on", so the admin's check succeeds. Nothing is sent.
    handler: () => ({ sent: true, to: currentUser().Email }),
  },
  {
    method: 'GET',
    match: /^\/settings$/,
    handler: () => ({ Report_Interval_Seconds: 900, Report_Interval_Minutes: 15 }),
  },
  {
    method: 'PATCH',
    match: /^\/settings$/,
    handler: (unused, { body }) => ({
      Report_Interval_Minutes: Number(body.Report_Interval_Minutes),
      Report_Interval_Seconds: Number(body.Report_Interval_Minutes) * 60,
    }),
  },
];

export async function request({ method = 'GET', path, query, body }) {
  await sleep(LATENCY_MS);

  for (const route of routes) {
    if (route.method !== method) continue;
    const matched = route.match.exec(path);
    if (!matched) continue;

    const result = route.handler(matched.slice(1), { query, body });
    return structuredClone(result ?? null);
  }

  throw new ApiError(`No mock route for ${method} ${path}.`, {
    status: 404,
    code: 'NO_MOCK_ROUTE',
  });
}

/**
 * Hybrid mode: mirror the real API's signed-in user into the mock so notes and
 * readings are attributed to them. Offset ids keep it clear of the seeded roster.
 */
export function adoptUser(real) {
  const UserID = 100000 + real.UserID;
  const existing = db.users.find((candidate) => candidate.UserID === UserID);
  const user = Object.assign(existing ?? {}, real, { UserID, Is_Active: true });
  if (!existing) db.users.push(user);
  session = { token: 'hybrid', user };
}

export function forgetUser() {
  session = null;
}

export function setAuthToken() {
  // The mock transport tracks its session object directly; nothing to do.
}
