import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, test } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const servers = [];

function listen(handler) {
  const server = http.createServer(handler);
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

after(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

/**
 * The compose stack publishes one API. This proxy is the behavior nginx would
 * provide with several healthy replicas behind API_UPSTREAM: round-robin, skip
 * anything whose /health is down, strip the /api prefix, and keep the security
 * headers on the way out.
 */
function startBalancer(replicas) {
  let cursor = 0;

  async function healthy(replica) {
    try {
      const response = await fetch(`http://127.0.0.1:${replica.port}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function choose() {
    const start = cursor;
    cursor = (cursor + 1) % replicas.length;
    for (let offset = 0; offset < replicas.length; offset += 1) {
      const replica = replicas[(start + offset) % replicas.length];
      if (await healthy(replica)) return replica;
    }
    return null;
  }

  return listen(async (req, res) => {
    const replica = await choose();
    if (!replica) {
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('bad gateway');
      return;
    }

    const upstreamPath = req.url.replace(/^\/api(?=\/|$)/, '') || '/';
    const forwarded = req.headers['x-forwarded-for']
      ? `${req.headers['x-forwarded-for']}, ${req.socket.remoteAddress}`
      : req.socket.remoteAddress;

    const upstream = await new Promise((resolve) => {
      const request = httpRequest(replica.port, upstreamPath, forwarded, (response) => resolve(response));
      request.on('error', () => resolve(null));
      request.end();
    });

    if (!upstream) {
      res.writeHead(502);
      res.end('bad gateway');
      return;
    }

    const headers = {
      'content-type': upstream.headers['content-type'] || 'application/json',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'SAMEORIGIN',
      'referrer-policy': 'strict-origin-when-cross-origin',
    };
    res.writeHead(upstream.statusCode, headers);
    upstream.pipe(res);
  });
}

function httpRequest(port, path, forwardedFor, callback) {
  return http.request(
    {
      hostname: '127.0.0.1',
      port,
      path,
      method: 'GET',
      headers: {
        'x-forwarded-for': forwardedFor,
        'x-forwarded-proto': 'http',
      },
    },
    callback,
  );
}

function startReplica(id) {
  let up = true;
  const hits = [];
  const replica = {
    id,
    hits,
    port: 0,
    setUp(value) {
      up = value;
    },
  };

  return listen((req, res) => {
    if (req.url === '/health') {
      res.writeHead(up ? 200 : 503, { 'content-type': 'text/plain' });
      res.end(up ? 'ok' : 'down');
      return;
    }
    hits.push({ path: req.url, forwarded: req.headers['x-forwarded-for'] });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id, path: req.url }));
  }).then(({ port }) => {
    replica.port = port;
    return replica;
  });
}

describe('round-robin across API replicas', () => {
  test('spreads traffic, strips /api, and forwards the client address', async () => {
    const replicas = await Promise.all([startReplica('a'), startReplica('b'), startReplica('c')]);
    const { port } = await startBalancer(replicas);

    const responses = await Promise.all(
      Array.from({ length: 90 }, () => fetch(`http://127.0.0.1:${port}/api/metrics?season=2026`)),
    );
    const bodies = await Promise.all(responses.map((response) => response.json()));

    const counts = { a: 0, b: 0, c: 0 };
    for (const body of bodies) counts[body.id] += 1;
    assert.deepEqual(counts, { a: 30, b: 30, c: 30 });

    for (const replica of replicas) {
      assert.equal(replica.hits.length, 30);
      for (const hit of replica.hits) {
        assert.equal(hit.path, '/metrics?season=2026');
        assert.match(hit.forwarded, /127\.0\.0\.1/);
      }
    }

    const sample = responses[0];
    assert.equal(sample.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(sample.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(sample.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  });

  test('skips a replica whose health check fails and fails closed when none are up', async () => {
    const replicas = await Promise.all([startReplica('a'), startReplica('b'), startReplica('c')]);
    replicas[1].setUp(false);
    const { port } = await startBalancer(replicas);

    const responses = await Promise.all(
      Array.from({ length: 30 }, () => fetch(`http://127.0.0.1:${port}/api/metrics`)),
    );
    const bodies = await Promise.all(responses.map((response) => response.json()));
    const counts = { a: 0, b: 0, c: 0 };
    for (const body of bodies) counts[body.id] += 1;

    assert.equal(counts.b, 0);
    assert.equal(counts.a + counts.c, 30);
    assert.equal(replicas[1].hits.length, 0);

    for (const replica of replicas) replica.setUp(false);
    const down = await fetch(`http://127.0.0.1:${port}/api/metrics`);
    assert.equal(down.status, 502);
  });
});

describe('nginx and compose contract', () => {
  const nginx = readFileSync(join(root, 'Maple-Sugar-FE', 'nginx.conf.template'), 'utf8');
  const headers = readFileSync(join(root, 'Maple-Sugar-FE', 'security-headers.conf'), 'utf8');
  const compose = readFileSync(join(root, 'docker-compose.yml'), 'utf8');

  test('the edge strips /api, resolves the upstream per request, and forwards identity', () => {
    assert.match(nginx, /location ~ \^\/api\/\(\.\*\)\$/);
    assert.match(nginx, /set \$api_upstream \$\{API_UPSTREAM\}/);
    assert.match(nginx, /proxy_pass \$api_upstream\/\$1\$is_args\$args/);
    assert.match(nginx, /resolver \$\{NGINX_LOCAL_RESOLVERS\}/);
    assert.match(nginx, /X-Real-IP \$remote_addr/);
    assert.match(nginx, /X-Forwarded-For \$proxy_add_x_forwarded_for/);
    assert.match(nginx, /X-Forwarded-Proto \$scheme/);
    assert.match(nginx, /try_files \$uri \$uri\/ \/index\.html/);
  });

  test('every location that sets its own caching still includes the security headers', () => {
    assert.match(headers, /X-Content-Type-Options "nosniff"/);
    assert.match(headers, /X-Frame-Options "SAMEORIGIN"/);
    assert.match(headers, /Referrer-Policy "strict-origin-when-cross-origin"/);

    const locations = nginx.split(/location /).slice(1);
    for (const location of locations) {
      if (location.includes('add_header')) {
        assert.match(location, /include \/etc\/nginx\/security-headers\.conf/);
      }
    }
    assert.match(nginx, /location \/assets\/[\s\S]*max-age=31536000, immutable/);
    assert.match(nginx, /location = \/index\.html[\s\S]*no-cache, must-revalidate/);
  });

  test('only nginx is published, and it waits until the API is healthy', () => {
    const api = compose.split(/^ {2}web:/m)[0].split(/^ {2}api:/m)[1];
    const web = compose.split(/^ {2}web:/m)[1].split(/^volumes:/m)[0];
    assert.match(api, /expose:\n\s+- "3000"/);
    assert.equal(/^\s+ports:/m.test(api), false);
    assert.match(web, /"8080:80"/);
    assert.match(web, /api:[\s\S]*condition: service_healthy/);
    assert.match(api, /fetch\('http:\/\/127\.0\.0\.1:3000\/health'\)/);
  });
});
