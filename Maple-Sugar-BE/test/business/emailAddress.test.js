import '../env.js';

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { canonicalEmail } from '../../src/business/emailAddress.js';

describe('canonical email', () => {
  test('stores every RIT address under g.rit.edu', () => {
    assert.equal(canonicalEmail('ir8643@rit.edu'), 'ir8643@g.rit.edu');
    assert.equal(canonicalEmail('  IR8643@RIT.EDU '), 'ir8643@g.rit.edu');
    assert.equal(canonicalEmail('ir8643@g.rit.edu'), 'ir8643@g.rit.edu');
  });

  test('leaves other domains alone apart from case and spaces', () => {
    assert.equal(canonicalEmail(' Ada@Example.org'), 'ada@example.org');
    assert.equal(canonicalEmail('someone@cs.rit.edu'), 'someone@cs.rit.edu');
    assert.equal(canonicalEmail('ritmaplesugaring@gmail.com'), 'ritmaplesugaring@gmail.com');
  });

  test('passes blanks through', () => {
    assert.equal(canonicalEmail(''), '');
    assert.equal(canonicalEmail(null), '');
  });
});
