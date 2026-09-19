import dayjs from 'dayjs';
import { ApiError } from '../ApiError';
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
  return { ...slot, Assignees: assignees };
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
  { method: 'GET', match: /^\/buckets$/, handler: () => db.buckets },
  { method: 'GET', match: /^\/guides$/, handler: () => db.guides },

  // ---- Nodes ------------------------------------------------------------
  { method: 'GET', match: /^\/nodes$/, handler: () => db.nodes },
  {
    method: 'GET',
    match: /^\/nodes\/(\d+)$/,
    handler: ([id]) =>
      db.nodes.find((node) => node.NodeID === Number(id)) ?? notFound('Node'),
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
      const slot = {
        SlotID: nextId.slot++,
        Task: body.Task,
        Stand: body.Stand,
        Starts_At: body.Starts_At,
        Ends_At: body.Ends_At,
        Capacity: Number(body.Capacity ?? 2),
        Assigned_UserIDs: [],
        Is_Complete: false,
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
