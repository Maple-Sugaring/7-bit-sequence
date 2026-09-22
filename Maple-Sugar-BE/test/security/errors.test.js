import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import '../env.js';
import { ApiError } from '../../src/lib/ApiError.js';
import { errorHandler, notFoundHandler } from '../../src/middleware/errorHandler.js';
import {
  createSlotBody,
  idParam,
  inviteUserBody,
  updateSettingsBody,
} from '../../src/routes/schemas.js';

function capture(handler, error) {
  return new Promise((resolve) => {
    const response = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        resolve(this);
      },
    };
    handler(error, { path: '/metrics' }, response, () => {});
  });
}

describe('error responses', () => {
  test('an unknown route names the method and path without a stack', () => {
    let sent = null;
    const response = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        sent = { statusCode: this.statusCode, body };
      },
    };
    notFoundHandler({ method: 'DELETE', path: '/nope' }, response);
    assert.equal(sent.statusCode, 404);
    assert.equal(sent.body.code, 'NOT_FOUND');
    assert.match(sent.body.message, /DELETE \/nope/);
    assert.equal(sent.body.stack, undefined);
  });

  test('hides an internal exception message and stack', async () => {
    const failure = new Error('password=super-secret relation users');
    failure.stack = 'Error: password=super-secret\n    at secret.js:1';
    const response = await capture(errorHandler, failure);
    assert.equal(response.statusCode, 500);
    assert.equal(response.body.code, 'INTERNAL');
    assert.equal(response.body.message, 'Something went wrong on our end.');
    assert.equal(JSON.stringify(response.body).includes('super-secret'), false);
    assert.equal(JSON.stringify(response.body).includes('secret.js'), false);
  });

  test('passes an ApiError through with its status and code', async () => {
    const response = await capture(
      errorHandler,
      new ApiError('Sign in to continue.', { status: 401, code: 'BAD_CREDENTIALS' }),
    );
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, {
      message: 'Sign in to continue.',
      code: 'BAD_CREDENTIALS',
      details: null,
    });
  });

  test('flattens a Zod failure onto the fields that failed', async () => {
    const parsed = createSlotBody.safeParse({
      Task: '',
      Starts_At: 'not-a-date',
      Ends_At: '2026-03-11T15:00:00.000Z',
      UserID: 5,
      BucketIDs: [1],
    });
    assert.equal(parsed.success, false);
    const response = await capture(errorHandler, parsed.error);
    assert.equal(response.statusCode, 422);
    assert.equal(response.body.code, 'VALIDATION');
    assert.equal(typeof response.body.details.Task, 'string');
    assert.equal(typeof response.body.details.Starts_At, 'string');
  });

  test('translates a unique-constraint violation into a validation response', async () => {
    const response = await capture(errorHandler, { code: '23505' });
    assert.equal(response.statusCode, 422);
    assert.equal(response.body.code, 'VALIDATION');
    assert.match(response.body.message, /already exists/);
  });
});

describe('request schemas', () => {
  test('path ids must be positive integers', () => {
    assert.equal(idParam.parse('4'), 4);
    assert.throws(() => idParam.parse('0'));
    assert.throws(() => idParam.parse('-3'));
    assert.throws(() => idParam.parse('1;drop'));
  });

  test('a shift has to end after it starts and name a student and a bucket', () => {
    const result = createSlotBody.safeParse({
      Task: 'Collect',
      Starts_At: '2026-03-11T16:00:00.000Z',
      Ends_At: '2026-03-11T15:00:00.000Z',
      UserID: 5,
      BucketIDs: [1],
    });
    assert.equal(result.success, false);

    const missing = createSlotBody.safeParse({
      Task: 'Collect',
      Starts_At: '2026-03-11T15:00:00.000Z',
      Ends_At: '2026-03-11T17:00:00.000Z',
      UserID: 5,
      BucketIDs: [],
    });
    assert.equal(missing.success, false);
  });

  test('invites need a real email and a known role', () => {
    assert.equal(inviteUserBody.safeParse({ email: 'not-an-email', roleId: 2 }).success, false);
    assert.equal(inviteUserBody.safeParse({ email: 'ada@rit.edu', roleId: 9 }).success, false);
    assert.equal(inviteUserBody.safeParse({ email: '  Ada@rit.edu  ', roleId: 2 }).success, true);
  });

  test('the report interval stays inside a day', () => {
    assert.equal(updateSettingsBody.safeParse({ Report_Interval_Minutes: 0 }).success, false);
    assert.equal(updateSettingsBody.safeParse({ Report_Interval_Minutes: 1441 }).success, false);
    assert.equal(updateSettingsBody.safeParse({ Report_Interval_Minutes: 15 }).success, true);
  });
});
