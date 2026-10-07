import { describe, expect, test } from 'vitest';

import { gatewayLook, sincePostText } from '../src/components/deploy/gatewayStyle';

const NOW = Date.parse('2026-10-05T12:00:00Z');
const ago = (seconds) => new Date(NOW - seconds * 1000).toISOString();

describe('sincePostText', () => {
  test('counts seconds, then minutes and seconds', () => {
    expect(sincePostText(ago(7), NOW)).toBe('7 s ago');
    expect(sincePostText(ago(60), NOW)).toBe('1 min 0 s ago');
    expect(sincePostText(ago(3 * 60 + 12), NOW)).toBe('3 min 12 s ago');
  });

  test('rolls up to hours and days', () => {
    expect(sincePostText(ago(2 * 3600 + 5 * 60 + 9), NOW)).toBe('2 h 5 min ago');
    expect(sincePostText(ago(26 * 3600), NOW)).toBe('1 d 2 h ago');
  });

  test('handles a gateway that never posted and a clock slightly behind', () => {
    expect(sincePostText(null, NOW)).toBe('No posts yet');
    expect(sincePostText('not a date', NOW)).toBe('No posts yet');
    expect(sincePostText(ago(-5), NOW)).toBe('0 s ago');
  });
});

describe('gatewayLook', () => {
  test('is stable per gateway and shares one icon', () => {
    expect(gatewayLook(3)).toEqual(gatewayLook(3));
    expect(gatewayLook(1).icon).toBe(gatewayLook(2).icon);
    expect(gatewayLook(1).accent).not.toBe(gatewayLook(2).accent);
  });
});
