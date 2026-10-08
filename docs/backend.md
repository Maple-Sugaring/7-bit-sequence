# Backend (`Maple-Sugar-BE`)

Express 5 (ES modules, Node 22+), Postgres via `pg`, optional Redis, `zod` request validation, `pino` logging, `helmet`, `google-auth-library`, `jsonwebtoken`, `nodemailer`.

The deep reference is in `Maple-Sugar-BE/docs/` (see [README.md](README.md#existing-backend-docs)). This page is the map plus what changed since those docs were written.

## Layout (`Maple-Sugar-BE/src`)

| Path | Role |
| --- | --- |
| `server.js` | Boot order and graceful shutdown (SIGTERM/SIGINT, 10 s force-exit backstop). |
| `app.js` | Express assembly. Routes mounted at the root; `/health` before auth. |
| `config.js` | Reads and validates env once; throws with a list of problems on boot. |
| `routes/` | `auth`, `reference` (roles, gateways, buckets, guides), `nodes`, `metrics`, `ingest`, `alerts`, `collectionLogs`, `journal`, `schedule`, `weather`, `users`, `settings`; `schemas.js` holds the zod shapes. |
| `services/` | `authService`, `metricsService`, `ingestService`, `weatherService`, `historicWeather`, `calendarService`, `notificationService`, `nodeWatch`, `housekeeping`, `readingBuffer`. |
| `repositories/` | SQL, one file per table group; `mappers.js` converts rows to the JSON contract. |
| `business/` | Pure rules: `permissions`, `thresholds`, `validation`, `alerting`, `sapFlow`, `season`, `sites`, `availability`. |
| `auth/` | `jwt.js`, `googleOAuth.js`, `secrets.js` (AES-256-GCM for Google refresh tokens, key derived from `JWT_SECRET`). |
| `db/` | `pool.js`, `migrate.js` (forward-only, one transaction per file, tracked in `schema_migrations`), `clearSeed.js`. |
| `cache/` | Redis read-through, namespaces and TTLs. Optional. |
| `middleware/` | `authenticate.js` (`attachUser`, `requireAuth`, `requireCapability`, `requireAnyCapability`, `requireGateway`), `errorHandler.js`. |

Boot order: migrations, `clearSeededData`, promote bootstrap admins, load historic weather if empty, connect Redis, invalidate gateway/node caches, listen, start housekeeping.

## Seed data is cleared on every boot

`migrations/003_seed.sql` inserts a fixture bush, but `db/clearSeed.js` removes it on each API start: nodes with the baked-in fixture LoRa ids, fixture stands (`Hill Bottom`, `Rabbi House`, `Sugar Shack`, `North Ridge`), and fixture gateways (`GW-SHACK`, `GW-RELAY`, `GW-CHABAD`, `GW-BARN`). Roles, users, guides, and nodes or gateways created from Deploy (including `GW-ALUMNI`) are kept. Migrations `010_drop_seed_metrics.sql` and `011_drop_seed_alerts.sql` removed fixture metrics (those with a temperature) and the first eight fixture alerts. Migration `009_two_nodes.sql` marks only `NODE-001` and `NODE-002` as tracked.

## Routes added after the older API doc

These exist in code but are missing from `Maple-Sugar-BE/docs/api.md` (verified in `routes/nodes.js` and `routes/reference.js`):

| Method | Path | Capability |
| --- | --- | --- |
| POST | `/gateways` | `deploy_nodes` |
| POST | `/nodes` | `deploy_nodes` |
| DELETE | `/nodes/:id` | `deploy_nodes` |
| PATCH | `/nodes/:id/details` | `deploy_nodes` |
| PATCH | `/nodes/:id/interval` | `deploy_nodes` (`Report_Interval_Minutes`, 1 to 1440) |

Ingest also accepts `Fault` (`load-cell`, `unstable`, `reversed`, `untared`) instead of a weight, returns `Desired_Interval_Seconds` per accepted reading, and answers 202 `Buffered: true` when Postgres is unreachable.

## Alerts

Created by: metric derivation (`business/alerting.js`: Spoilage, Full Bucket, Tipped), weather (`weatherService`: Sap Run and harsh weather), node health (`nodeWatch`: Node Offline after 45 minutes, Missed Readings after two intervals), hardware faults from ingest, and manual flags (`POST /nodes/:id/flag`). An open alert of the same type on the same node is not duplicated.

Outbound notification (`notificationService.js`): critical alerts, plus Full Bucket, Node Offline, Spoilage, and Tipped, go out by SMTP email (`SMTP_URL`, `ALERT_FROM`, `ALERT_EMAILS`) and Twilio SMS (`TWILIO_*`, `ALERT_SMS_TO`). Both stay off until configured. Failures are logged, never thrown into the request. **TODO**: confirm how much of the email/SMS path has been tested against real SMTP and Twilio accounts (no live test found in the repo).

## Caching

`cache/redisCache.js` provides `readThrough(key, ttl, loader)` and namespace invalidation after writes. If Redis is down the API reads Postgres directly and `/health` reports `cache` state while staying 200. Only Postgres failure gives 503.

## Tests (`Maple-Sugar-BE/test`)

Node's built-in runner. Groups: `business/` (access, clearSeed, domain, dropSeedMetrics, mappers, mvpGaps, twoNodes), `security/` (authz, crypto, errors, http, ingest), `load/balance`. `test/env.js` injects fake config. No external services needed. Details: `Maple-Sugar-BE/docs/testing.md`.

## Scripts

`scripts/check-env-sync.js` (CI gate: `config.js` vs `.env.example`), `scripts/smoke.js` (end-to-end against a running API with minted tokens, `.env.test`), `scripts/check-ingest.js` (live ingest round trip).

## Files that matter operationally

- `Maple-Sugar-BE/data/historic-weather.json` is tracked and copied into the image, but `Maple-Sugar-BE/.gitignore` lists `data`. The same folder holds `ingest-buffer.jsonl` at runtime (the spool for batches that arrived while Postgres was down). In the compose file there is no volume for it, so the spool is lost if the `api` container is recreated before replay. **TODO**: mount a volume if that matters.
- `Maple-Sugar-BE/.env.test` is tracked and contains test values only.
