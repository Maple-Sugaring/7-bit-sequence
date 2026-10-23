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
  config.gmail.refreshToken = null;
});

/** Decodes the base64url MIME message the Gmail API was handed. */
function decodeRaw(init) {
  return Buffer.from(JSON.parse(init.body).raw, 'base64url').toString('utf8');
}

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

describe('Gmail transport', () => {
  test('refreshes an access token and sends one message per recipient', async () => {
    config.gmail.refreshToken = 'refresh-one';
    config.brevo.sender = 'ritmaplesugaring@gmail.com';
    const requests = [];
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url) === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'access-one', expires_in: 3599 }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 'm1' }), { status: 200 });
    };

    const result = await sendEmail({
      to: ['a@rit.edu', { email: 'b@rit.edu', name: 'Bea' }],
      subject: 'Hello',
      html: '<p>hi</p>',
      text: 'hi',
    });

    assert.equal(result.sent, 2);
    const [token, ...sends] = requests;
    const tokenBody = new URLSearchParams(token.init.body);
    assert.equal(tokenBody.get('grant_type'), 'refresh_token');
    assert.equal(tokenBody.get('refresh_token'), 'refresh-one');
    assert.equal(sends.length, 2);
    for (const send of sends) {
      assert.equal(send.url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
      assert.equal(send.init.headers.authorization, 'Bearer access-one');
    }
    const first = decodeRaw(sends[0].init);
    assert.match(first, /^From: RIT Maple Sugaring <ritmaplesugaring@gmail\.com>/m);
    assert.match(first, /^To: a@rit\.edu/m);
    assert.match(first, /^Subject: Hello/m);
    assert.match(decodeRaw(sends[1].init), /^To: Bea <b@rit\.edu>/m);
  });

  test('reuses the access token until it expires', async () => {
    config.gmail.refreshToken = 'refresh-two';
    config.brevo.sender = 'ritmaplesugaring@gmail.com';
    let tokenCalls = 0;
    globalThis.fetch = async (url) => {
      if (String(url) === 'https://oauth2.googleapis.com/token') {
        tokenCalls += 1;
        return new Response(JSON.stringify({ access_token: 'access-two', expires_in: 3599 }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    await sendEmail({ to: 'a@rit.edu', subject: 's', html: 'h', text: 't' });
    await sendEmail({ to: 'b@rit.edu', subject: 's', html: 'h', text: 't' });
    assert.equal(tokenCalls, 1);
  });

  test('wins over Brevo when both are configured', async () => {
    config.gmail.refreshToken = 'refresh-three';
    config.brevo.apiKey = 'xkeysib-test';
    config.brevo.sender = 'ritmaplesugaring@gmail.com';
    const urls = [];
    globalThis.fetch = async (url) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ access_token: 'x', expires_in: 3599 }), { status: 200 });
    };

    await sendEmail({ to: 'a@rit.edu', subject: 's', html: 'h', text: 't' });
    assert.ok(!urls.some((url) => url.includes('brevo')));
  });

  test('throws with the Google status when the refresh token is revoked', async () => {
    config.gmail.refreshToken = 'refresh-revoked';
    config.brevo.sender = 'ritmaplesugaring@gmail.com';
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });

    await assert.rejects(
      sendEmail({ to: 'a@rit.edu', subject: 's', html: 'h', text: 't' }),
      (error) => error.status === 400 && /invalid_grant/.test(error.message),
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
