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
  guides: structuredClone(seed.guides),
};

let nextId = {
  metric: Math.max(...db.metrics.map((m) => m.MetricID)) + 1,
  alert: Math.max(...db.alerts.map((a) => a.AlertID)) + 1,
  user: Math.max(...db.users.map((u) => u.UserID)) + 1,
  slot: Math.max(...db.scheduleSlots.map((s) => s.SlotID)) + 1,
  log: Math.max(...db.collectionLogs.map((l) => l.LogID)) + 1,
};

let session = null;

// Enough delay that loading skeletons are visible during development without
// making the app feel broken.
const LATENCY_MS = 180;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function notFound(resource) {
  throw new ApiError(`${resource} not found.`, { status: 404, code: 'NOT_FOUND' });
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

/** Same shape as GET /profile. Mail is never on in mock mode. */
function profileOf(user) {
  const role = roleFromId(user.RoleID);
  return {
    ...user,
    Pronouns: user.Pronouns ?? null,
    Email_Alerts: user.Email_Alerts ?? user.RoleID === 1,
    Email_Shifts: user.Email_Shifts ?? true,
    Role_Label: ROLE_LABELS[role] ?? role,
    Can_Receive_Alerts: can(role, Capability.VIEW_ALERTS),
    Mail_Enabled: false,
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
    };
  });
  return { ...slot, Assignees: assignees, Awaiting_Time: slot.Awaiting_Time ?? !slot.Starts_At };
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
      };
      db.gateways.push(gateway);
      return gateway;
    },
  },
  { method: 'GET', match: /^\/buckets$/, handler: () => db.buckets },
  { method: 'GET', match: /^\/guides$/, handler: () => db.guides },

  // ---- Nodes ------------------------------------------------------------
  { method: 'GET', match: /^\/nodes$/, handler: () => db.nodes },
  {
    method: 'POST',
    match: /^\/nodes$/,
    handler: (_match, { body }) => {
      const id = Math.max(0, ...db.nodes.map((node) => node.NodeID)) + 1;
      const node = {
        NodeID: id,
        Node_Code: `NODE-${String(id).padStart(3, '0')}`,
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
      };
      db.nodes.push(node);
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
        Recorded_By_UserID: session?.user?.UserID ?? null,
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
        UserID: session?.user?.UserID ?? null,
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

      const userId = Number(body?.userId ?? session?.user?.UserID);
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

      const userId = Number(body?.userId ?? session?.user?.UserID);
      slot.Assigned_UserIDs = slot.Assigned_UserIDs.filter((assigned) => assigned !== userId);
      return withAssignees(slot);
    },
  },
  {
    method: 'GET',
    match: /^\/schedule\/availability$/,
    handler: () => ({
      Time_Zone: 'America/New_York',
      Busy: [],
      Windows: [
        {
          Starts_At: dayjs().add(1, 'day').hour(8).minute(0).second(0).toISOString(),
          Ends_At: dayjs().add(1, 'day').hour(10).minute(0).second(0).toISOString(),
          Label: 'Tomorrow · 8:00 AM – 10:00 AM',
        },
        {
          Starts_At: dayjs().add(1, 'day').hour(14).minute(0).second(0).toISOString(),
          Ends_At: dayjs().add(1, 'day').hour(16).minute(0).second(0).toISOString(),
          Label: 'Tomorrow · 2:00 PM – 4:00 PM',
        },
      ],
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
      const userId = session?.user?.UserID;
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
    handler: () => ({
      Configured: false,
      Message: 'Live weather is available when the API is running with an OpenWeather key.',
    }),
  },
  {
    method: 'GET',
    match: /^\/journal$/,
    handler: () => [],
  },
  {
    method: 'POST',
    match: /^\/journal$/,
    handler: (unused, { body }) => ({
      EntryID: 1,
      Title: body.Title,
      Process_Notes: body.Process_Notes,
      Ice_Present: Boolean(body.Ice_Present),
      Weight_Lb: body.Weight,
      Sugar_Percent: body.Sugar_Percent,
      Collected_At: body.Collected_At,
      Author: 'You',
      Node_Name: null,
    }),
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
    handler: () => {
      throw new ApiError('Email is off. Set BREVO_API_KEY and MAIL_FROM on the server.', {
        status: 503,
        code: 'MAIL_DISABLED',
      });
    },
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

export function setAuthToken() {
  // The mock transport tracks its session object directly; nothing to do.
}
