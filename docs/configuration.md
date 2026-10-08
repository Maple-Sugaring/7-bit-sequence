# Configuration reference

Never commit real secrets. `.env` is git-ignored (root and `Maple-Sugar-BE/.gitignore`). The API validates configuration at boot and refuses to start with a list of problems.

## API (`Maple-Sugar-BE/.env`, template `.env.example`)

`npm run check-env` (and CI) fails if `src/config.js` and `.env.example` disagree.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `production` changes log level default. |
| `PORT` | no | `3000` | Listen port. |
| `LOG_LEVEL` | no | `info` in prod, `debug` otherwise | pino level. |
| `DATABASE_URL` | yes | none | Postgres URL. Compose overrides it to the `db` service. |
| `REDIS_URL` | no | none | Redis URL. Unset or down means no caching. Compose sets `redis://cache:6379`. |
| `JWT_SECRET` | yes | none | Min 32 characters. Signs sessions and (via SHA-256) derives the key encrypting Google refresh tokens. Rotating it signs everyone out and makes stored Calendar tokens undecryptable. |
| `SESSION_TTL_DAYS` | no | `7` | Session lifetime. |
| `GOOGLE_CLIENT_ID` | yes | none | OAuth web client. |
| `GOOGLE_CLIENT_SECRET` | yes | none | OAuth client secret. |
| `PUBLIC_API_URL` | no | `http://localhost:5173/api` | Browser-facing API base. Builds redirect URIs `{url}/auth/google/callback` and `.../auth/google/calendar/callback`; must match Google Console exactly. No trailing slash. Docker: `http://localhost:8080/api`. |
| `PUBLIC_WEB_URL` | no | `http://localhost:5173` | Where the browser goes after sign in; always allowed by CORS. |
| `ALLOWED_EMAIL_DOMAINS` | no | empty (any) in code; `g.rit.edu,rit.edu` in the example | Comma-separated sign-in domains. |
| `CORS_ORIGINS` | no | empty | Extra allowed origins. |
| `OPENWEATHER_API_KEY` | no | none | Live weather. Without it `/weather/live` returns `Configured: false`. |
| `SUGARBUSH_LATITUDE`, `SUGARBUSH_LONGITUDE` | no | `43.084`, `-77.680` | Weather location. |
| `GATEWAY_INGEST_TOKEN` | no | none | Shared secret for `POST /ingest`. Unset means 503 and nothing is stored. Generate with `openssl rand -base64 32`. Must equal the Pi's value. |
| `BOOTSTRAP_ADMIN_EMAILS` | no | empty | Created if missing and promoted to Admin (no expiry) on every API boot. Compose sets its own list for the `api` service, overriding the `.env` value. |
| `SMTP_URL` | no | none | `smtp://user:password@host:587`. Blank keeps email off. |
| `ALERT_FROM` | no | none | From address for alert mail. |
| `ALERT_EMAILS` | no | empty | Comma-separated recipients. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | no | none | Twilio SMS. Blank sid keeps texts off. |
| `ALERT_SMS_TO` | no | empty | Comma-separated E.164 numbers. |

Cookies: `maple_session` (session JWT) and `maple_oauth_state` (OAuth CSRF state), names fixed in `config.js`.

## Frontend (`Maple-Sugar-FE/.env.local`, template `.env.example`)

Only `VITE_*` variables reach the browser, and they are inlined at build time.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | API prefix used by `httpTransport`. |
| `VITE_API_MODE` | `mock` if unset, `http` in `.env.example` and the tracked `.env` | `http` real API, `mock` in-memory fixtures plus mock login buttons. |
| `API_UPSTREAM` | `http://api:3000` | Container only, read by nginx at start. Not a Vite variable. |

Docker build args for the `web` image (`docker-compose.yml`): `VITE_API_BASE_URL=/api`, `VITE_API_MODE=http`.

## Raspberry Pi gateway (`gateway/raspberry-pi/.env`)

See the table in [hardware.md](hardware.md#raspberry-pi-gateway): `GATEWAY_SERIAL`, `GATEWAY_BAUD`, `DASHBOARD_HOST`, `DASHBOARD_PORT`, `FORWARD_TO_SERVER`, `GATEWAY_CODE`, `MAPLE_API_URL`, `GATEWAY_INGEST_TOKEN`.

## Docker Compose (`docker-compose.yml`)

| Service | Image or build | Notes |
| --- | --- | --- |
| `db` | `postgres:17-alpine` pinned by digest | User/password/db `maple`/`maple`/`maple_sugaring` (local-only credentials, not exposed to the host), volume `postgres_data`, 512 MB, 1 CPU. |
| `cache` | `redis:7-alpine` pinned by digest | 128 MB, 0.5 CPU. |
| `api` | `./Maple-Sugar-BE` | Requires `Maple-Sugar-BE/.env`. Exposes 3000 to the network only. Health check on `/health`. 512 MB, 1 CPU. |
| `web` | `./Maple-Sugar-FE` | Publishes `8080:80`. Waits for `api` to be healthy. 128 MB, 0.5 CPU. |

## CI and notifications

| Setting | Where | Purpose |
| --- | --- | --- |
| `DISCORD_WEBHOOK_URL` | GitHub repository secret | Webhook for the main-push notification. Treat as a secret. |

## Other fixed constants

Sugar and bucket thresholds are in `Maple-Sugar-BE/src/business/thresholds.js` (mirrored in the frontend); see `Maple-Sugar-BE/docs/business.md`. Node offline threshold: `STALE_AFTER_MINUTES = 45`.
