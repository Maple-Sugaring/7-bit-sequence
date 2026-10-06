import '../env.js';

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { after, before, beforeEach, describe, mock, test } from 'node:test';

import { signSessionToken } from '../../src/auth/jwt.js';
import { config } from '../../src/config.js';
import { closePool, pool } from '../../src/db/pool.js';
import * as alertsRepository from '../../src/repositories/alertsRepository.js';
import { shiftAssignedEmail } from '../../src/services/emailTemplates.js';
import { escalateStaleAlerts, notifyCriticalAlert } from '../../src/services/notificationService.js';
import {
  notifyShiftAssigned,
  notifyShiftChanged,
  sendShiftReminders,
} from '../../src/services/shiftNotifications.js';

/**
 * Every email the API sends, end to end: real routes and services, a fake
 * Postgres, and Brevo's HTTP endpoint captured instead of called. Each test
 * asserts exactly who got what, so a new send path or a wrong recipient shows
 * up as a failure here.
 */

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const realFetch = globalThis.fetch;

// ---------------------------------------------------------------- fake data

let db;

function userRow(overrides) {
  return {
    role_id: 2,
    first_name: 'Sam',
    last_name: 'Student',
    created_at: '2026-01-15',
    last_login: null,
    is_active: true,
    account_expiry: '2099-06-01T00:00:00.000Z',
    google_calendar_id: null,
    calendar_connected: false,
    invite_pending: false,
    email_alerts: null,
    email_shifts: true,
    pronouns: null,
    ...overrides,
  };
}

const ADMIN = userRow({ id: 1, role_id: 1, first_name: 'Ada', last_name: 'Admin', email: 'ada@rit.edu' });
const STUDENT = userRow({ id: 2, first_name: 'Sam', last_name: 'Student', email: 'sam@g.rit.edu' });
const OTHER_STUDENT = userRow({ id: 3, first_name: 'Kim', last_name: 'Lee', email: 'kim@g.rit.edu' });
const MSS = userRow({ id: 4, role_id: 3, first_name: 'Mo', last_name: 'Society', email: 'mo@rit.edu' });

function reset() {
  db = {
    users: new Map(
      [ADMIN, STUDENT, OTHER_STUDENT, MSS].map((row) => [row.id, structuredClone(row)]),
    ),
    slots: new Map(),
    nextUserId: 50,
    nextSlotId: 100,
    nextAlertId: 1,
    dueReminders: [],
    released: [],
    staleAlerts: [],
    releasedAlerts: [],
  };
}

function addSlot(overrides = {}) {
  const slot = {
    id: db.nextSlotId++,
    task: 'Collect sap',
    stand: 'Alumni',
    starts_at: '2026-10-06T13:00:00.000Z',
    ends_at: '2026-10-06T15:00:00.000Z',
    capacity: 3,
    is_complete: false,
    node_id: 1,
    notes: '',
    bucket_ids: [1],
    assigned: [],
    ...overrides,
  };
  db.slots.set(slot.id, slot);
  return slot;
}

function slotRow(slot) {
  return {
    ...slot,
    alert_id: null,
    bucket_labels: ['A-1'],
    assigned_user_ids: [...slot.assigned],
    assignees: slot.assigned.map((userId) => ({
      userId,
      name: `${db.users.get(userId).first_name} ${db.users.get(userId).last_name}`,
      email: db.users.get(userId).email,
    })),
  };
}

function rows(list) {
  return { rows: list, rowCount: list.length };
}

/** Answers the statements the email paths issue, by SQL shape. */
function fakeQuery(text, params = []) {
  const sql = String(text);

  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return rows([]);

  // users
  if (sql.includes('coalesce(email_alerts, role_id = 1)')) {
    return rows(
      [...db.users.values()].filter(
        (user) => user.is_active && (user.email_alerts ?? user.role_id === 1),
      ),
    );
  }
  if (sql.includes('from users') && sql.includes('and role_id = 1')) {
    return rows([...db.users.values()].filter((user) => user.is_active && user.role_id === 1));
  }
  if (sql.includes('update users set')) {
    const user = db.users.get(Number(params[0]));
    const columns = /(first_name|last_name|pronouns|email_alerts|email_shifts) = \$(\d+)/g;
    for (const [, column, index] of sql.matchAll(columns)) {
      user[column] = params[Number(index) - 1];
    }
    return rows([user]);
  }
  if (sql.includes('lower(email)')) {
    return rows([...db.users.values()].filter((user) => user.email === params[0].toLowerCase()));
  }
  if (sql.includes('insert into users')) {
    const user = userRow({
      id: db.nextUserId++,
      role_id: params[0],
      first_name: params[1],
      last_name: params[2],
      email: params[3],
      invite_pending: true,
    });
    db.users.set(user.id, user);
    return rows([user]);
  }
  if (sql.includes('from users where id = $1')) {
    const user = db.users.get(Number(params[0]));
    return rows(user ? [user] : []);
  }

  // nodes and alerts
  if (sql.includes('from node where id = $1')) {
    return rows([{ id: params[0], node_name: 'Alumni 1' }]);
  }
  if (sql.includes('insert into alerts')) {
    return rows([
      {
        id: db.nextAlertId++,
        node_id: params[0],
        alert_type: params[1],
        severity: params[2],
        message: params[3],
        is_resolved: false,
        created_at: '2026-10-05T14:00:00.000Z',
      },
    ]);
  }

  if (sql.includes('set escalated_at = CURRENT_TIMESTAMP')) {
    const stale = db.staleAlerts;
    db.staleAlerts = [];
    return rows(stale);
  }
  if (sql.includes('set escalated_at = null')) {
    db.releasedAlerts.push(params[0]);
    return rows([]);
  }

  // reminders
  if (sql.includes('set reminder_sent_at = CURRENT_TIMESTAMP')) {
    const due = db.dueReminders;
    db.dueReminders = [];
    return rows(due.map(({ slotId, userId }) => ({ slot_id: slotId, user_id: userId })));
  }
  if (sql.includes('set reminder_sent_at = null')) {
    db.released.push(params);
    return rows([]);
  }

  // schedule
  if (sql.includes('from buckets b') && sql.includes('join node n')) {
    return rows(params[0].map((id) => ({ id, node_id: 1, stand: 'Alumni', node_name: 'Alumni 1' })));
  }
  if (sql.includes('insert into schedule_slots')) {
    const slot = addSlot({
      task: params[0],
      stand: params[1],
      starts_at: params[2],
      ends_at: params[3],
      capacity: params[4],
      node_id: params[6],
      notes: params[7],
      bucket_ids: params[8],
    });
    return rows([{ id: slot.id }]);
  }
  if (sql.includes('from schedule_slots where id = $1 for update')) {
    const slot = db.slots.get(Number(params[0]));
    return rows(slot ? [slot] : []);
  }
  if (sql.includes('from schedule_slots s') && sql.includes('where s.id = $1')) {
    const slot = db.slots.get(Number(params[0]));
    return rows(slot ? [slotRow(slot)] : []);
  }
  if (sql.includes('update schedule_slots set')) {
    const slot = db.slots.get(Number(params[0]));
    for (const [, column, index] of sql.matchAll(/(\w+) = \$(\d+)/g)) {
      if (column !== 'id') slot[column] = params[Number(index) - 1];
    }
    return rows([{ id: slot.id }]);
  }
  if (sql.includes('delete from schedule_slots')) {
    const existed = db.slots.delete(Number(params[0]));
    return rows(existed ? [{ id: params[0] }] : []);
  }
  if (sql.includes('select user_id, google_event_id from schedule_assignments')) {
    const slot = db.slots.get(Number(params[0]));
    return rows((slot?.assigned ?? []).map((userId) => ({ user_id: userId, google_event_id: null })));
  }
  if (sql.includes('select user_id from schedule_assignments')) {
    return rows(db.slots.get(Number(params[0])).assigned.map((userId) => ({ user_id: userId })));
  }
  if (sql.includes('tstzrange')) return rows([]);
  if (sql.includes('insert into schedule_assignments')) {
    db.slots.get(Number(params[0])).assigned.push(Number(params[1]));
    return rows([]);
  }
  if (sql.includes('delete from schedule_assignments')) {
    const slot = db.slots.get(Number(params[0]));
    const index = slot.assigned.indexOf(Number(params[1]));
    if (index === -1) return rows([]);
    slot.assigned.splice(index, 1);
    return rows([{ google_event_id: null }]);
  }

  return rows([]);
}

// ------------------------------------------------------------ captured mail

let outbox;
let texts;
let brevoStatus;
let twilioStatus;

/** One entry per delivered copy: { to, subject, tags }. */
function captureBrevo(url, init) {
  if (String(url).startsWith('https://api.twilio.com/')) {
    if (twilioStatus !== 201) return Promise.resolve(new Response('{"message":"down"}', { status: twilioStatus }));
    const form = new URLSearchParams(String(init.body));
    texts.push({ to: form.get('To'), body: form.get('Body') });
    return Promise.resolve(new Response('{"sid":"SM1"}', { status: 201 }));
  }
  if (String(url) !== BREVO_URL) return realFetch(url, init);
  const body = JSON.parse(init.body);
  if (brevoStatus !== 201) {
    return Promise.resolve(new Response('{"message":"Key not found"}', { status: brevoStatus }));
  }
  for (const version of body.messageVersions) {
    outbox.push({ to: version.to[0].email, subject: body.subject, tags: body.tags, text: body.textContent });
  }
  return Promise.resolve(new Response('{"messageIds":["1"]}', { status: 201 }));
}

/** Sends happen after the response; wait until the outbox stops growing. */
async function settle() {
  let seen = -1;
  for (let i = 0; i < 20 && seen !== outbox.length; i += 1) {
    seen = outbox.length;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

function sent() {
  return outbox.map(({ to, subject }) => ({ to, subject })).sort((a, b) => a.to.localeCompare(b.to));
}

// ------------------------------------------------------------------- server

let baseUrl;
let server;

before(async () => {
  mock.method(pool, 'query', async (text, params) => fakeQuery(text, params));
  mock.method(pool, 'connect', async () => ({
    query: async (text, params) => fakeQuery(text, params),
    release() {},
  }));
  globalThis.fetch = captureBrevo;

  const { createApp } = await import('../../src/app.js');
  server = createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  globalThis.fetch = realFetch;
  config.brevo.apiKey = null;
  config.brevo.sender = null;
  config.alertEmails = [];
  resetLegacyChannels();
  await new Promise((resolve) => server.close(resolve));
  await closePool();
});

function resetLegacyChannels() {
  config.smtpUrl = null;
  config.alertFrom = null;
  config.twilio = { accountSid: null, authToken: null, from: null };
  config.alertSmsTo = [];
  config.alertEscalationMinutes = 30;
}

beforeEach(() => {
  reset();
  outbox = [];
  texts = [];
  brevoStatus = 201;
  twilioStatus = 201;
  resetLegacyChannels();
  config.brevo.apiKey = 'xkeysib-test';
  config.brevo.sender = 'ritmaplesugaring@gmail.com';
  config.alertEmails = [];
});

function tokenFor(user) {
  return signSessionToken({ UserID: user.id, Email: user.email, RoleID: user.role_id });
}

async function call(user, method, path, body) {
  const response = await realFetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${tokenFor(user)}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  await settle();
  return { status: response.status, json: text ? JSON.parse(text) : null };
}

const WHEN = 'Tue, Oct 6, 9:00 AM – 11:00 AM EDT';

// -------------------------------------------------------------------- tests

describe('critical alert emails', () => {
  test('go to admins, opted-in users, and ALERT_EMAILS once each', async () => {
    db.users.get(OTHER_STUDENT.id).email_alerts = true; // opted in
    config.alertEmails = ['club@rit.edu', 'ADA@rit.edu']; // ADA duplicates the admin

    await alertsRepository.createAlert({
      NodeID: 1,
      Alert_Type: 'Full Bucket',
      Description: 'Bucket A-1 is 95% full.',
      severity: 'warning',
    });
    await settle();

    const subject = 'Maple Sugaring alert: Full Bucket at Alumni 1';
    assert.deepEqual(sent(), [
      { to: 'ada@rit.edu', subject },
      { to: 'club@rit.edu', subject },
      { to: 'kim@g.rit.edu', subject },
    ]);
  });

  test('skip admins who opted out and inactive accounts', async () => {
    db.users.get(ADMIN.id).email_alerts = false;
    db.users.get(OTHER_STUDENT.id).email_alerts = true;
    db.users.get(OTHER_STUDENT.id).is_active = false;

    await alertsRepository.createAlert({ NodeID: 1, Alert_Type: 'Spoilage', severity: 'critical' });
    await settle();

    assert.deepEqual(sent(), []);
  });

  test('every critical type mails; routine warnings do not', async () => {
    for (const [type, severity] of [
      ['Node Offline', 'critical'],
      ['Tipped', 'warning'],
      ['Ice Storm', 'critical'],
      ['Low Battery', 'warning'],
      ['Missed Readings', 'warning'],
      ['Sap Run', 'info'],
    ]) {
      await alertsRepository.createAlert({ NodeID: null, Alert_Type: type, severity });
    }
    await settle();

    assert.deepEqual(
      outbox.map((mail) => mail.subject),
      [
        'Maple Sugaring alert: Node Offline at the sugarbush',
        'Maple Sugaring alert: Tipped at the sugarbush',
        'Maple Sugaring alert: Ice Storm at the sugarbush',
      ],
    );
  });
});

describe('shift emails', () => {
  test('a student signing up gets a confirmation', async () => {
    const slot = addSlot();
    const response = await call(STUDENT, 'POST', `/schedule/slots/${slot.id}/signup`);

    assert.equal(response.status, 200);
    assert.deepEqual(sent(), [{ to: 'sam@g.rit.edu', subject: `You signed up for: Collect sap, ${WHEN}` }]);
  });

  test('an admin signing a student up sends them an assignment', async () => {
    const slot = addSlot();
    await call(ADMIN, 'POST', `/schedule/slots/${slot.id}/signup`, { userId: STUDENT.id });

    assert.deepEqual(sent(), [{ to: 'sam@g.rit.edu', subject: `You were assigned: Collect sap, ${WHEN}` }]);
  });

  test('an admin creating a shift for a student sends them an assignment', async () => {
    const response = await call(ADMIN, 'POST', '/schedule/slots', {
      Task: 'Collect sap',
      Starts_At: '2026-10-06T13:00:00.000Z',
      Ends_At: '2026-10-06T15:00:00.000Z',
      UserID: STUDENT.id,
      BucketIDs: [1],
    });

    assert.equal(response.status, 201);
    assert.deepEqual(sent(), [{ to: 'sam@g.rit.edu', subject: `You were assigned: Collect sap, ${WHEN}` }]);
  });

  test('an open shift with nobody assigned sends nothing', async () => {
    await call(ADMIN, 'POST', '/schedule/slots', {
      Task: 'Collect sap',
      Starts_At: '2026-10-06T13:00:00.000Z',
      Ends_At: '2026-10-06T15:00:00.000Z',
      BucketIDs: [1],
    });
    assert.deepEqual(sent(), []);
  });

  test('withdrawing, or being removed by an admin, sends a removal', async () => {
    const slot = addSlot({ assigned: [STUDENT.id, OTHER_STUDENT.id] });
    await call(STUDENT, 'POST', `/schedule/slots/${slot.id}/withdraw`);
    await call(ADMIN, 'POST', `/schedule/slots/${slot.id}/withdraw`, { userId: OTHER_STUDENT.id });

    const subject = `Removed from shift: Collect sap, ${WHEN}`;
    assert.deepEqual(sent(), [
      { to: 'kim@g.rit.edu', subject },
      { to: 'sam@g.rit.edu', subject },
    ]);
    assert.ok(outbox.find((mail) => mail.to === 'kim@g.rit.edu').text.includes('An administrator took you off'));
    assert.ok(outbox.find((mail) => mail.to === 'sam@g.rit.edu').text.includes('You withdrew'));
  });

  test('withdrawing from a shift you were not on sends nothing', async () => {
    const slot = addSlot();
    await call(STUDENT, 'POST', `/schedule/slots/${slot.id}/withdraw`);
    assert.deepEqual(sent(), []);
  });

  test('moving a shift mails every assignee the new time and resets reminders', async () => {
    const slot = addSlot({ assigned: [STUDENT.id, OTHER_STUDENT.id] });
    await call(ADMIN, 'PATCH', `/schedule/slots/${slot.id}`, {
      Starts_At: '2026-10-07T13:00:00.000Z',
      Ends_At: '2026-10-07T15:00:00.000Z',
    });

    const subject = 'Shift changed: Collect sap, now Wed, Oct 7, 9:00 AM – 11:00 AM EDT';
    assert.deepEqual(sent(), [
      { to: 'kim@g.rit.edu', subject },
      { to: 'sam@g.rit.edu', subject },
    ]);
    assert.deepEqual(db.released, [[slot.id]]);
  });

  test('a capacity-only edit sends nothing', async () => {
    const slot = addSlot({ assigned: [STUDENT.id] });
    await call(ADMIN, 'PATCH', `/schedule/slots/${slot.id}`, { Capacity: 5 });
    assert.deepEqual(sent(), []);
  });

  test('deleting a shift mails a cancellation to everyone on it', async () => {
    const slot = addSlot({ assigned: [STUDENT.id, OTHER_STUDENT.id] });
    const response = await call(ADMIN, 'DELETE', `/schedule/slots/${slot.id}`);

    assert.equal(response.status, 204);
    const subject = `Shift cancelled: Collect sap, ${WHEN}`;
    assert.deepEqual(sent(), [
      { to: 'kim@g.rit.edu', subject },
      { to: 'sam@g.rit.edu', subject },
    ]);
  });

  test('a student with shift email off gets nothing', async () => {
    db.users.get(STUDENT.id).email_shifts = false;
    const slot = addSlot();
    await call(STUDENT, 'POST', `/schedule/slots/${slot.id}/signup`);
    assert.deepEqual(sent(), []);
  });
});

describe('shift reminders', () => {
  test('one per due assignment, skipping anyone opted out', async () => {
    const slot = addSlot({ assigned: [STUDENT.id, OTHER_STUDENT.id] });
    db.users.get(OTHER_STUDENT.id).email_shifts = false;
    db.dueReminders = [
      { slotId: slot.id, userId: STUDENT.id },
      { slotId: slot.id, userId: OTHER_STUDENT.id },
    ];

    assert.equal(await sendShiftReminders(), 1);
    assert.deepEqual(sent(), [{ to: 'sam@g.rit.edu', subject: `Reminder: Collect sap, ${WHEN}` }]);
  });

  test('a Brevo failure releases the reminder for the next pass', async () => {
    const slot = addSlot({ assigned: [STUDENT.id] });
    db.dueReminders = [{ slotId: slot.id, userId: STUDENT.id }];
    brevoStatus = 500;

    assert.equal(await sendShiftReminders(), 0);
    assert.deepEqual(db.released, [[slot.id, STUDENT.id]]);
  });
});

describe('invites and test email', () => {
  test('an invite emails the new person a sign-in link', async () => {
    const response = await call(ADMIN, 'POST', '/users/invite', { email: 'new@g.rit.edu', roleId: 2 });

    assert.equal(response.status, 201);
    assert.deepEqual(sent(), [{ to: 'new@g.rit.edu', subject: 'You are invited to RIT Maple Sugaring' }]);
    assert.ok(outbox[0].text.includes('Ada Admin invited you'));
    assert.ok(outbox[0].text.includes('as Student'));
  });

  test('the admin test email goes only to the admin who asked', async () => {
    const response = await call(ADMIN, 'POST', '/notifications/test');
    assert.equal(response.status, 200);
    assert.deepEqual(sent(), [{ to: 'ada@rit.edu', subject: 'Maple Sugaring test email' }]);
  });

  test('students cannot send a test email', async () => {
    const response = await call(STUDENT, 'POST', '/notifications/test');
    assert.equal(response.status, 403);
    assert.deepEqual(sent(), []);
  });

  test('a rejected Brevo key is a 502 on the test email', async () => {
    brevoStatus = 401;
    const response = await call(ADMIN, 'POST', '/notifications/test');
    assert.equal(response.status, 502);
    assert.equal(response.json.code, 'MAIL_FAILED');
  });
});

describe('profile', () => {
  test('every role can read their own profile, without secrets', async () => {
    for (const user of [ADMIN, STUDENT, MSS]) {
      const response = await call(user, 'GET', '/profile');
      assert.equal(response.status, 200);
      assert.equal(response.json.Email, user.email);
      assert.equal('google_refresh_token' in response.json, false);
    }
    assert.equal((await call(MSS, 'GET', '/profile')).json.Role_Label, 'MSS Member');
  });

  test('names and pronouns save trimmed', async () => {
    const response = await call(STUDENT, 'PATCH', '/profile', {
      First_Name: '  Samantha ',
      Last_Name: 'Student',
      Pronouns: ' she/her ',
    });
    assert.equal(response.status, 200);
    assert.equal(response.json.First_Name, 'Samantha');
    assert.equal(response.json.Pronouns, 'she/her');
    assert.equal(db.users.get(STUDENT.id).first_name, 'Samantha');
  });

  test('blank pronouns clear the field', async () => {
    db.users.get(STUDENT.id).pronouns = 'he/him';
    const response = await call(STUDENT, 'PATCH', '/profile', { Pronouns: '   ' });
    assert.equal(response.status, 200);
    assert.equal(response.json.Pronouns, null);
  });

  test('a blank first name, an overlong pronoun, or an email change is refused', async () => {
    for (const body of [{ First_Name: '  ' }, { Pronouns: 'x'.repeat(41) }, { Email: 'evil@rit.edu' }, {}]) {
      assert.equal((await call(STUDENT, 'PATCH', '/profile', body)).status, 422);
    }
    assert.equal(db.users.get(STUDENT.id).email, 'sam@g.rit.edu');
  });

  test('a role or account field cannot be smuggled in', async () => {
    for (const body of [{ RoleID: 1 }, { Is_Active: true }, { Account_Expiry: null }]) {
      assert.equal((await call(STUDENT, 'PATCH', '/profile', body)).status, 422);
    }
    assert.equal(db.users.get(STUDENT.id).role_id, 2);
  });

  test('a student can turn shift email off and alert email on', async () => {
    const response = await call(STUDENT, 'PATCH', '/profile', {
      Email_Shifts: false,
      Email_Alerts: true,
    });
    assert.equal(response.status, 200);
    assert.equal(response.json.Email_Shifts, false);
    assert.equal(response.json.Email_Alerts, true);
  });

  test('defaults: admins get alerts, students do not', async () => {
    assert.equal((await call(ADMIN, 'GET', '/profile')).json.Email_Alerts, true);
    assert.equal((await call(STUDENT, 'GET', '/profile')).json.Email_Alerts, false);
  });

  test('MSS members cannot opt into alerts they cannot see', async () => {
    const response = await call(MSS, 'PATCH', '/profile', { Email_Alerts: true });
    assert.equal(response.status, 403);
  });

  test('signed-out requests are refused', async () => {
    const response = await realFetch(`${baseUrl}/profile`);
    assert.equal(response.status, 401);
  });
});

describe('mail turned off', () => {
  test('nothing reaches Brevo and the test email says why', async () => {
    config.brevo.apiKey = null;
    const slot = addSlot();

    await call(STUDENT, 'POST', `/schedule/slots/${slot.id}/signup`);
    await alertsRepository.createAlert({ NodeID: 1, Alert_Type: 'Spoilage', severity: 'critical' });
    await settle();
    const test = await call(ADMIN, 'POST', '/notifications/test');

    assert.deepEqual(sent(), []);
    assert.equal(test.status, 503);
    assert.equal(test.json.code, 'MAIL_DISABLED');
    assert.equal((await call(STUDENT, 'GET', '/profile')).json.Mail_Enabled, false);
  });
});

// -------------------------------------------- deployments that predate Brevo

function enableTwilio() {
  config.twilio = { accountSid: 'AC123', authToken: 'secret', from: '+15855550000' };
  config.alertSmsTo = ['+15855550100', '+15855550101'];
}

/** Just enough SMTP to accept one message and hand back what it sent. */
async function startFakeSmtp() {
  const messages = [];
  const server = createTcpServer((socket) => {
    let body = null;
    socket.write('220 fake ESMTP\r\n');
    socket.on('data', (chunk) => {
      const text = chunk.toString();
      if (body !== null) {
        body += text;
        if (body.includes('\r\n.\r\n')) {
          messages.push(body);
          body = null;
          socket.write('250 queued\r\n');
        }
        return;
      }
      for (const line of text.split('\r\n').filter(Boolean)) {
        const command = line.slice(0, 4).toUpperCase();
        if (command === 'EHLO') socket.write('250 fake\r\n');
        else if (command === 'DATA') {
          socket.write('354 go\r\n');
          body = '';
        } else if (command === 'QUIT') {
          socket.write('221 bye\r\n');
          socket.end();
        } else socket.write('250 ok\r\n');
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { messages, port: server.address().port, close: () => new Promise((resolve) => server.close(resolve)) };
}

describe('critical alerts on deployments that predate Brevo', () => {
  test('SMTP_URL still mails ALERT_EMAILS while Brevo is off', async () => {
    const smtp = await startFakeSmtp();
    try {
      config.brevo.apiKey = null;
      config.smtpUrl = `smtp://127.0.0.1:${smtp.port}`;
      config.alertFrom = 'maple-alerts@rit.edu';
      config.alertEmails = ['club@rit.edu'];

      await alertsRepository.createAlert({ NodeID: 1, Alert_Type: 'Spoilage', severity: 'critical' });
      for (let i = 0; i < 40 && !smtp.messages.length; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      assert.equal(smtp.messages.length, 1);
      assert.match(smtp.messages[0], /To: club@rit\.edu/);
      assert.match(smtp.messages[0], /Subject: Maple Sugaring alert: Spoilage at Alumni 1/);
      assert.deepEqual(outbox, [], 'Brevo is off, so nothing goes through it');
    } finally {
      await smtp.close();
    }
  });

  test('SMS goes to every ALERT_SMS_TO number, with Brevo on or off', async () => {
    enableTwilio();
    await alertsRepository.createAlert({ NodeID: 1, Alert_Type: 'Full Bucket', severity: 'warning', Description: 'A-1 is full.' });
    await settle();
    assert.deepEqual(texts.map((text) => text.to).sort(), ['+15855550100', '+15855550101']);
    assert.match(texts[0].body, /Full Bucket at Alumni 1\. A-1 is full\./);
    assert.equal(outbox.length, 1, 'the admin still gets the Brevo email');

    texts = [];
    outbox = [];
    config.brevo.apiKey = null;
    await alertsRepository.createAlert({ NodeID: 1, Alert_Type: 'Spoilage', severity: 'critical' });
    await settle();
    assert.equal(texts.length, 2);
    assert.deepEqual(outbox, []);
  });

  test('routine warnings send no SMS', async () => {
    enableTwilio();
    await alertsRepository.createAlert({ NodeID: 1, Alert_Type: 'Low Battery', severity: 'warning' });
    await settle();
    assert.deepEqual(texts, []);
  });

  test('a Twilio outage does not stop the email', async () => {
    enableTwilio();
    twilioStatus = 500;
    await notifyCriticalAlert({ AlertID: 1, NodeID: 1, Alert_Type: 'Spoilage', severity: 'critical' });
    assert.deepEqual(sent(), [{ to: 'ada@rit.edu', subject: 'Maple Sugaring alert: Spoilage at Alumni 1' }]);
  });
});

// ------------------------------------------------------ expired accounts

/** The API-facing shape the notify functions receive. */
function mappedSlot(slot) {
  return {
    Task: slot.task,
    Stand: slot.stand,
    Starts_At: slot.starts_at,
    Ends_At: slot.ends_at,
    Assigned_UserIDs: [...slot.assigned],
  };
}

describe('expired accounts get no shift email', () => {
  const expired = () => {
    const user = userRow({
      id: 5,
      first_name: 'Ex',
      last_name: 'Pired',
      email: 'ex@g.rit.edu',
      account_expiry: '2020-01-01T00:00:00.000Z',
    });
    db.users.set(user.id, user);
    return user;
  };

  test('assignment, change, and reminder all skip them', async () => {
    const user = expired();
    const slot = addSlot({ assigned: [user.id, STUDENT.id] });
    db.dueReminders = [
      { slotId: slot.id, userId: user.id },
      { slotId: slot.id, userId: STUDENT.id },
    ];

    const mapped = mappedSlot(slot);
    await notifyShiftAssigned(user.id, mapped, { byAdmin: true });
    await notifyShiftChanged(mapped);
    assert.equal(await sendShiftReminders(), 1);

    assert.deepEqual(
      sent().map((mail) => mail.to),
      ['sam@g.rit.edu', 'sam@g.rit.edu'],
      'only the active student is mailed, for the change and the reminder',
    );
  });

  test('an account that expires later today or in the future still gets mail', async () => {
    const user = expired();
    user.account_expiry = '2099-01-01T00:00:00.000Z';
    await notifyShiftAssigned(user.id, mappedSlot(addSlot()));
    assert.deepEqual(sent().map((mail) => mail.to), ['ex@g.rit.edu']);
  });
});

// ------------------------------------------------- reminder promise honesty

describe('the assignment email only promises a reminder it will send', () => {
  const NOW = new Date('2026-10-05T12:00:00.000Z');
  const at = (hoursAway) => ({
    Task: 'Collect sap',
    Stand: 'Alumni',
    Starts_At: new Date(NOW.getTime() + hoursAway * 3_600_000).toISOString(),
    Ends_At: new Date(NOW.getTime() + (hoursAway + 2) * 3_600_000).toISOString(),
  });
  const reminderWindow = () => config.shiftReminderHours;

  test('a shift further out than the reminder window promises one', () => {
    const { text } = shiftAssignedEmail(at(reminderWindow() + 1), { now: NOW });
    assert.match(text, new RegExp(`reminder about ${reminderWindow()} hours before`));
  });

  test('a shift inside the window says no separate reminder is coming', () => {
    for (const hours of [reminderWindow() - 1, 1]) {
      const { text } = shiftAssignedEmail(at(hours), { now: NOW, byAdmin: true });
      assert.doesNotMatch(text, /We will send a reminder/);
      assert.match(text, /starts soon, so we will not send a separate reminder/);
    }
  });

  test('a shift with no time yet promises nothing either way', () => {
    const { text } = shiftAssignedEmail({ Task: 'Collect sap', Stand: 'Alumni', Starts_At: null }, { now: NOW });
    assert.doesNotMatch(text, /reminder/i);
  });
});

// ----------------------------------------------------- escalation (FR-025)

describe('alert escalation after the window (FR-025)', () => {
  const alertRow = (overrides = {}) => ({
    id: 7,
    node_id: 1,
    alert_type: 'Spoilage',
    severity: 'critical',
    message: 'Sap is spoiling.',
    is_resolved: false,
    created_at: '2026-10-05T14:00:00.000Z',
    ...overrides,
  });

  test('re-sends to admins who muted routine alerts, plus opted-in users and ALERT_EMAILS', async () => {
    db.users.get(ADMIN.id).email_alerts = false; // muted, but still escalated to
    db.users.get(OTHER_STUDENT.id).email_alerts = true;
    config.alertEmails = ['club@rit.edu'];
    db.staleAlerts = [alertRow()];

    assert.equal(await escalateStaleAlerts(), 1);

    const subject = 'ESCALATED: Maple Sugaring alert: Spoilage at Alumni 1';
    assert.deepEqual(sent(), [
      { to: 'ada@rit.edu', subject },
      { to: 'club@rit.edu', subject },
      { to: 'kim@g.rit.edu', subject },
    ]);
    assert.match(outbox[0].text, /Nobody has resolved this alert in 30 minutes/);
    assert.ok(outbox.every((mail) => mail.tags.includes('escalated')));
    assert.deepEqual(db.releasedAlerts, []);
  });

  test('an inactive or expired admin is not escalated to', async () => {
    db.users.get(ADMIN.id).is_active = false;
    db.staleAlerts = [alertRow()];
    await escalateStaleAlerts();
    assert.deepEqual(sent(), []);
  });

  test('texts the on-call numbers too, marked escalated', async () => {
    enableTwilio();
    db.staleAlerts = [alertRow()];
    await escalateStaleAlerts();
    assert.equal(texts.length, 2);
    assert.match(texts[0].body, /^ESCALATED, unresolved 30 min: Maple Sugaring Spoilage at Alumni 1/);
  });

  test('nothing due means nothing sent', async () => {
    assert.equal(await escalateStaleAlerts(), 0);
    assert.deepEqual(sent(), []);
  });

  test('a failed send is released so the next pass retries it', async () => {
    db.staleAlerts = [alertRow({ id: 9 })];
    brevoStatus = 500;
    assert.equal(await escalateStaleAlerts(), 0);
    assert.deepEqual(db.releasedAlerts, [9]);
  });

  test('0 minutes turns escalation off without touching the table', async () => {
    config.alertEscalationMinutes = 0;
    db.staleAlerts = [alertRow()];
    assert.equal(await escalateStaleAlerts(), 0);
    assert.equal(db.staleAlerts.length, 1, 'nothing was claimed');
    assert.deepEqual(sent(), []);
  });

  test('the claim query only takes unresolved, unescalated, old, notify-worthy alerts', async () => {
    const queries = [];
    const original = pool.query.mock.calls.length;
    await escalateStaleAlerts();
    for (const call of pool.query.mock.calls.slice(original)) queries.push(String(call.arguments[0]));
    const claim = queries.find((sql) => sql.includes('escalated_at = CURRENT_TIMESTAMP'));
    assert.match(claim, /is_resolved = false/);
    assert.match(claim, /escalated_at is null/);
    assert.match(claim, /make_interval\(mins => \$1\)/);
    assert.match(claim, /severity = 'critical' or alert_type = any/);
  });
});
