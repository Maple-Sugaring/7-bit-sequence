#!/bin/bash
set -euo pipefail
umask 077
source /opt/maple/config/host.env
cd /opt/maple/current
compose=(docker compose --env-file /opt/maple/config/compose.env -f docker-compose.yml -f terraform/compose.production.yml)
sql="select 'node',count(*) from node union all select 'metrics',count(*) from metrics union all select 'users',count(*) from users union all select 'buckets',count(*) from buckets union all select 'gateway',count(*) from gateway union all select 'schema_migrations',count(*) from schema_migrations"
"${compose[@]}" exec -T db psql -U maple -d maple_sugaring -Atc "$sql"
curl --fail --silent --show-error "https://$PUBLIC_HOSTNAME/api/health"
curl --fail --silent --show-error "https://$PUBLIC_HOSTNAME/" | grep -q '/assets/'

# Replay an existing sample to exercise authenticated ingest without adding data.
"${compose[@]}" exec -T api node --input-type=module - <<'JS'
import assert from 'node:assert/strict';
import { config } from './src/config.js';
import { pool, closePool } from './src/db/pool.js';
import { signSessionToken } from './src/auth/jwt.js';
import { findUserById } from './src/repositories/usersRepository.js';
try {
  const handshake = await fetch(`${config.publicApiUrl}/auth/google`, {redirect:'manual'});
  assert.equal(handshake.status, 302);
  const authorization = new URL(handshake.headers.get('location'));
  assert.equal(authorization.hostname, 'accounts.google.com');
  assert.equal(authorization.searchParams.get('redirect_uri'), config.google.redirectUri);
  assert.match(handshake.headers.get('set-cookie'), /Secure/);
  const active = await pool.query(`select id from users where is_active
    and (account_expiry is null or account_expiry >= current_date) limit 1`);
  assert.equal(active.rows.length, 1, 'Need an existing active account for session verification');
  const user = await findUserById(active.rows[0].id);
  const session = await fetch(`${config.publicApiUrl}/auth/session`, {
    headers:{Authorization:`Bearer ${signSessionToken(user)}`}
  });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).user.UserID, user.UserID);
  console.log('\nOAuth redirect and secure cookie verified; authenticated app session: 200');
  const url = `${config.publicApiUrl}/ingest`;
  const denied = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body:'{}' });
  assert.equal(denied.status, 401);
  const { rows } = await pool.query(`select m.node_id, m.recorded_at, m.weight, m.ice_present, g.gateway_code
    from metrics m join node n on n.id=m.node_id join gateway g on g.id=n.gateway_id
    where m.weight is not null order by m.recorded_at desc limit 1`);
  assert.equal(rows.length, 1, 'Need an existing gateway reading for idempotent verification');
  const row = rows[0];
  const payload = { Gateway_Code:row.gateway_code, NodeID:row.node_id,
    Recorded_At:row.recorded_at.toISOString(), Weight:Number(row.weight), Ice_Present:row.ice_present };
  const accepted = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json', 'X-Gateway-Token':config.gatewayIngestToken}, body:JSON.stringify(payload) });
  assert.equal(accepted.status, 200, 'An existing sample should return an idempotent success');
  assert.equal((await accepted.json()).Accepted[0].Duplicate, true);
  console.log('\nAuthenticated ingest: 200 duplicate; unauthenticated ingest: 401');
} finally { await closePool(); }
JS

# Verify a real S3 round trip, restoring into a disposable, uniquely named DB.
backup_uri="s3://$BACKUP_BUCKET/daily/verify-$(date -u +%Y-%m-%dT%H-%M-%SZ).dump"
dump=$(mktemp --suffix=.dump)
baseline=$(mktemp)
restored=$(mktemp)
scratch=maple_verify_$(date +%s)_$$
scratch_created=false
cleanup() {
  if "$scratch_created"; then "${compose[@]}" exec -T db dropdb -U maple "$scratch"; fi
  rm -f "$dump" "$baseline" "$restored"
}
trap cleanup EXIT
"${compose[@]}" exec -T db pg_dump -U maple -d maple_sugaring -Fc > "$dump"
aws s3 cp "$dump" "$backup_uri" --region "$AWS_REGION" --sse AES256 --only-show-errors
truncate -s 0 "$dump"
aws s3 cp "$backup_uri" "$dump" --region "$AWS_REGION" --only-show-errors
"${compose[@]}" exec -T db psql -U maple -d maple_sugaring -Atc "$sql" > "$baseline"
"${compose[@]}" exec -T db createdb -U maple "$scratch"
scratch_created=true
"${compose[@]}" exec -T db pg_restore -U maple -d "$scratch" --no-owner --no-acl --exit-on-error < "$dump"
"${compose[@]}" exec -T db psql -U maple -d "$scratch" -Atc "$sql" > "$restored"
diff -u "$baseline" "$restored"
echo 'S3 backup restored successfully; key table counts match'
"${compose[@]}" ps
