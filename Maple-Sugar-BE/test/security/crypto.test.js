import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { describe, test } from 'node:test';

import '../env.js';
import {
  buildAuthorizationUrl,
  buildCalendarAuthorizationUrl,
  createState,
  isAllowedDomain,
  statesMatch,
} from '../../src/auth/googleOAuth.js';
import {
  accessCookieOptions,
  generateRefreshToken,
  hashRefreshToken,
  refreshCookieOptions,
  signAccessToken,
  stateCookieOptions,
  verifyAccessToken,
} from '../../src/auth/jwt.js';
import { decryptSecret, encryptSecret } from '../../src/auth/secrets.js';
import { accessTokenTtlSeconds, config, refreshTokenTtlSeconds } from '../../src/config.js';

const user = { UserID: 4, Email: 'ada@rit.edu', RoleID: 1 };

describe('access tokens', () => {
  test('round-trips the id, email, and role and pins the issuer', () => {
    const payload = verifyAccessToken(signAccessToken(user));
    assert.equal(payload.sub, '4');
    assert.equal(payload.email, 'ada@rit.edu');
    assert.equal(payload.roleId, 1);
    assert.equal(payload.typ, 'access');
    assert.equal(payload.iss, 'maple-sugar-api');
  });

  test('rejects a missing token, a bad signature, the wrong issuer, and an expired token', () => {
    assert.equal(verifyAccessToken(null), null);
    assert.equal(verifyAccessToken('not-a-token'), null);

    const otherSecret = jwt.sign({ sub: '4' }, 'a-different-secret-that-is-also-long-enough', {
      issuer: 'maple-sugar-api',
    });
    assert.equal(verifyAccessToken(otherSecret), null);

    const wrongIssuer = jwt.sign({ sub: '4' }, config.jwtSecret, { issuer: 'someone-else' });
    assert.equal(verifyAccessToken(wrongIssuer), null);

    const expired = jwt.sign({ sub: '4' }, config.jwtSecret, {
      issuer: 'maple-sugar-api',
      expiresIn: -10,
    });
    assert.equal(verifyAccessToken(expired), null);
  });

  test('rejects a token that claims a non-access type', () => {
    const refreshy = jwt.sign({ sub: '4', typ: 'refresh' }, config.jwtSecret, {
      issuer: 'maple-sugar-api',
    });
    assert.equal(verifyAccessToken(refreshy), null);
  });

  test('rejects an unsigned alg=none token', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: '4', iss: 'maple-sugar-api', exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString('base64url');
    assert.equal(verifyAccessToken(`${header}.${payload}.`), null);
  });
});

describe('refresh token material', () => {
  test('is high-entropy, unique, and hashes deterministically', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    assert.notEqual(a, b);
    assert.equal(a.length > 40, true);
    // The stored form is a hash, never the token itself.
    assert.equal(hashRefreshToken(a), hashRefreshToken(a));
    assert.notEqual(hashRefreshToken(a), a);
    assert.equal(hashRefreshToken(a).length, 64);
  });
});

describe('auth cookies', () => {
  test('are httpOnly and Lax, and stay insecure on the plain-HTTP stack', () => {
    assert.equal(config.publicWebUrl.startsWith('https://'), false);
    for (const options of [accessCookieOptions(), refreshCookieOptions(), stateCookieOptions()]) {
      assert.equal(options.httpOnly, true);
      assert.equal(options.sameSite, 'lax');
      assert.equal(options.secure, false);
      assert.equal(options.path, '/');
    }
    assert.equal(accessCookieOptions().maxAge, accessTokenTtlSeconds * 1000);
    assert.equal(refreshCookieOptions().maxAge, refreshTokenTtlSeconds * 1000);
    assert.equal(stateCookieOptions().maxAge, 10 * 60 * 1000);
  });
});

describe('refresh tokens at rest', () => {
  test('round-trips a secret and returns null for empty input', () => {
    const packed = encryptSecret('refresh-token-ñ');
    assert.notEqual(packed, 'refresh-token-ñ');
    assert.equal(packed.split('.').length, 3);
    assert.equal(decryptSecret(packed), 'refresh-token-ñ');
    assert.equal(encryptSecret(''), null);
    assert.equal(decryptSecret(null), null);
    assert.equal(decryptSecret('not-a-payload'), null);
  });

  test('refuses a ciphertext whose authentication tag was flipped', () => {
    const [iv, tag, data] = encryptSecret('refresh-token').split('.');
    // Flip a decoded tag byte. Changing the last base64url character is not
    // enough: that character only carries two live bits, so a neighboring
    // alphabet letter can decode to the same tag and decrypt successfully.
    const tagBytes = Buffer.from(tag, 'base64url');
    tagBytes[0] ^= 0xff;
    const flipped = tagBytes.toString('base64url');
    assert.notEqual(flipped, tag);
    assert.throws(() => decryptSecret(`${iv}.${flipped}.${data}`));
  });
});

describe('Google OAuth', () => {
  test('compares state with a length check and rejects a missing side', () => {
    const state = createState();
    assert.equal(state.length > 20, true);
    assert.notEqual(createState(), state);
    assert.equal(statesMatch(state, state), true);
    assert.equal(statesMatch(state, `${state}x`), false);
    assert.equal(statesMatch(state, 'short'), false);
    assert.equal(statesMatch(undefined, state), false);
    assert.equal(statesMatch('', state), false);
  });

  test('authorization URLs carry the state and never the client secret', () => {
    const login = buildAuthorizationUrl('login-state');
    const calendar = buildCalendarAuthorizationUrl('calendar-state');

    assert.match(login, /login-state/);
    assert.match(login, /select_account/);
    assert.match(calendar, /calendar-state/);
    assert.match(calendar, /consent/);
    assert.match(calendar, /calendar\.events/);
    assert.equal(login.includes(config.google.clientSecret), false);
    assert.equal(calendar.includes(config.google.clientSecret), false);
  });

  test('allows only the configured RIT domains', () => {
    assert.equal(isAllowedDomain('ada@rit.edu'), true);
    assert.equal(isAllowedDomain('ada@G.RIT.edu'), true);
    assert.equal(isAllowedDomain('ada@gmail.com'), false);
    assert.equal(isAllowedDomain('ada@student.rit.edu'), false);
    assert.equal(isAllowedDomain('not-an-email'), false);
  });
});
