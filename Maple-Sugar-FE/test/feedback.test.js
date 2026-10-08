import process from 'node:process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../api/feedback';

function response() {
  return {
    setHeader: vi.fn(),
    status: vi.fn(function status(code) { this.code = code; return this; }),
    json: vi.fn(function json(body) { this.body = body; return this; }),
    end: vi.fn(function end() { return this; }),
  };
}

function request(overrides = {}) {
  return {
    method: 'POST',
    headers: { origin: 'https://example.com', host: 'example.com' },
    body: { category: 'Bug', message: 'The map is blank.' },
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DISCORD_WEBHOOK_URL;
});

describe('feedback endpoint', () => {
  it('sends valid feedback without Discord mentions', async () => {
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.example/webhook';
    const send = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', send);
    const reply = response();

    await handler(request({ body: { category: 'Bug', message: '@everyone The map is blank.' } }), reply);

    expect(reply.code).toBe(204);
    expect(send).toHaveBeenCalledOnce();
    expect(JSON.parse(send.mock.calls[0][1].body)).toEqual({
      content: '**Mock app feedback - Bug**\n@everyone The map is blank.',
      allowed_mentions: { parse: [] },
    });
  });

  it('rejects cross-origin and invalid feedback without sending', async () => {
    const send = vi.fn();
    vi.stubGlobal('fetch', send);
    const wrongOrigin = response();
    const invalid = response();

    await handler(request({ headers: { origin: 'https://other.example', host: 'example.com' } }), wrongOrigin);
    await handler(request({ body: { category: 'Bug', message: ' ' } }), invalid);

    expect(wrongOrigin.code).toBe(403);
    expect(invalid.code).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it('reports Discord delivery failures', async () => {
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.example/webhook';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const reply = response();

    await handler(request(), reply);

    expect(reply.code).toBe(502);
  });
});
