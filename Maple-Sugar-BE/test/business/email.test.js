import '../env.js';

import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import { config } from '../../src/config.js';
import {
  criticalAlertEmail,
  formatShiftWindow,
  inviteEmail,
  shiftAssignedEmail,
} from '../../src/services/emailTemplates.js';
import { isMailEnabled, sendEmail, uniqueRecipients } from '../../src/services/mailService.js';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  config.brevo.apiKey = null;
  config.brevo.sender = null;
});

describe('mail recipients', () => {
  test('dedupes case-insensitively and accepts user rows', () => {
    const recipients = uniqueRecipients([
      { Email: 'ir8643@g.rit.edu', First_Name: 'Innocenzio', Last_Name: 'Rizzuto' },
      'IR8643@g.rit.edu',
      'club@rit.edu',
      null,
    ]);
    assert.deepEqual(recipients, [
      { email: 'ir8643@g.rit.edu', name: 'Innocenzio Rizzuto' },
      { email: 'club@rit.edu' },
    ]);
  });
});

describe('Brevo transport', () => {
  test('stays off without a key and sender', async () => {
    assert.equal(isMailEnabled(), false);
    let called = false;
    globalThis.fetch = async () => {
      called = true;
    };
    const result = await sendEmail({ to: 'a@rit.edu', subject: 's', html: '<p>h</p>', text: 't' });
    assert.equal(result.disabled, true);
    assert.equal(called, false);
  });

  test('posts one message version per recipient', async () => {
    config.brevo.apiKey = 'xkeysib-test';
    config.brevo.sender = 'alerts@example.org';
    let request;
    globalThis.fetch = async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({ messageIds: ['1', '2'] }), { status: 201 });
    };

    const result = await sendEmail({
      to: ['a@rit.edu', 'b@rit.edu'],
      subject: 'Hello',
      html: '<p>hi</p>',
      text: 'hi',
      tags: ['test'],
    });

    assert.equal(result.sent, 2);
    assert.equal(request.url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(request.init.headers['api-key'], 'xkeysib-test');
    const body = JSON.parse(request.init.body);
    assert.equal(body.sender.email, 'alerts@example.org');
    assert.deepEqual(
      body.messageVersions.map((version) => version.to[0].email),
      ['a@rit.edu', 'b@rit.edu'],
    );
  });

  test('throws with the Brevo status on a rejected send', async () => {
    config.brevo.apiKey = 'bad';
    config.brevo.sender = 'alerts@example.org';
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ code: 'unauthorized', message: 'Key not found' }), { status: 401 });

    await assert.rejects(
      sendEmail({ to: 'a@rit.edu', subject: 's', html: 'h', text: 't' }),
      (error) => error.status === 401,
    );
  });
});

describe('email templates', () => {
  test('formats shift times in sugarbush time', () => {
    // 13:00Z in October is 9:00 AM EDT.
    assert.equal(
      formatShiftWindow('2026-10-06T13:00:00.000Z', '2026-10-06T15:00:00.000Z'),
      'Tue, Oct 6, 9:00 AM – 11:00 AM EDT',
    );
  });

  test('escapes user-entered text in HTML but keeps it in plain text', () => {
    const email = shiftAssignedEmail({
      Task: 'Collect <sap>',
      Stand: 'Alumni',
      Starts_At: '2026-10-06T13:00:00.000Z',
      Ends_At: '2026-10-06T15:00:00.000Z',
      Notes: '<script>x</script>',
    });
    assert.ok(email.html.includes('Collect &lt;sap&gt;'));
    assert.ok(!email.html.includes('<script>'));
    assert.ok(email.text.includes('Notes: <script>x</script>'));
  });

  test('alert email names the node and links to alerts', () => {
    const email = criticalAlertEmail({
      Alert_Type: 'Full Bucket',
      NodeID: 3,
      Node_Name: 'Alumni 1',
      Description: 'Bucket is 95% full.',
      severity: 'warning',
    });
    assert.equal(email.subject, 'Maple Sugaring alert: Full Bucket at Alumni 1');
    assert.ok(email.text.includes(`${config.publicWebUrl}/notifications`));
  });

  test('invite links to sign-in', () => {
    const email = inviteEmail({ roleLabel: 'Student', inviterName: 'Nalin Cooper' });
    assert.ok(email.text.includes('Nalin Cooper invited you'));
    assert.ok(email.text.includes(`${config.publicWebUrl}/login`));
  });
});
