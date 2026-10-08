# Setup and development

## Prerequisites

| Tool | Needed for |
| --- | --- |
| Node.js 22+ and npm | Frontend and backend (`engines.node >= 22` in `Maple-Sugar-BE/package.json`; Dockerfiles use `node:22-alpine`). |
| Docker Desktop | The full compose stack. |
| PostgreSQL (database `maple_sugaring`) | Local API without Docker. |
| Redis | Optional. The API runs without it. |
| PlatformIO (`pio`) | Building or flashing firmware from a laptop. |
| Python 3 | Running the Pi gateway app (Raspberry Pi OS). |
| Chrome or Edge | The Deploy page's USB flasher (Web Serial). |

## Option 1: UI only, mock data (fastest)

No database, Redis, or Google credentials.

```bash
cd Maple-Sugar-FE
cp .env.example .env.local
# edit .env.local:  VITE_API_MODE=mock
npm install
npm run dev          # http://localhost:5173
```

On the login page, extra buttons ("Continue as Administrator / Student / MSS Member") appear in mock mode only. See [roles-and-logins.md](roles-and-logins.md).

Note: `Maple-Sugar-FE/.env` is tracked in git and sets `VITE_API_MODE=http`. `.env.local` overrides it. If `VITE_API_MODE` is unset entirely, `apiClient.js` defaults to `mock`.

## Option 2: UI + API, local processes

1. Create a Postgres database `maple_sugaring`. Redis on `localhost:6379` is optional.
2. Backend env:

   ```bash
   cd Maple-Sugar-BE
   cp .env.example .env
   ```

   Set at least `DATABASE_URL`, `JWT_SECRET` (32+ chars, for example `openssl rand -base64 48`), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. For the Vite dev server set `PUBLIC_API_URL=http://localhost:5173/api` and `PUBLIC_WEB_URL=http://localhost:5173`. Full list in [configuration.md](configuration.md).

3. Google Cloud Console: register the redirect URIs `http://localhost:5173/api/auth/google/callback` and `http://localhost:5173/api/auth/google/calendar/callback`. Enable the Google Calendar API and the scopes `calendar.events` and `calendar.freebusy` if you want shift sync.
4. Add your email to `BOOTSTRAP_ADMIN_EMAILS` so you can sign in (there is no self signup; an invite must exist).
5. Start the API (migrations run on boot):

   ```bash
   npm install
   npm run dev          # http://localhost:3000, GET /health
   ```

6. Start the UI against it:

   ```bash
   cd ../Maple-Sugar-FE
   cp .env.example .env.local     # VITE_API_BASE_URL=/api, VITE_API_MODE=http
   npm install
   npm run dev
   ```

Vite proxies `/api` to `http://127.0.0.1:3000` and strips the prefix.

## Option 3: Docker Compose (production-like)

```bash
cp Maple-Sugar-BE/.env.example Maple-Sugar-BE/.env   # then fill it in
docker compose up --build
```

Open `http://localhost:8080`. For this stack set in `Maple-Sugar-BE/.env`: `PUBLIC_API_URL=http://localhost:8080/api` and `PUBLIC_WEB_URL=http://localhost:8080`, and register `http://localhost:8080/api/auth/google/callback` (and the calendar callback) with Google. Compose overrides `DATABASE_URL`, `REDIS_URL`, `NODE_ENV`, `PORT`, and `BOOTSTRAP_ADMIN_EMAILS` for the `api` service. See [operations.md](operations.md).

VITE values are baked in at image build time. After changing `VITE_*` rebuild: `docker compose build web`.

## Commands

| Where | Command | Does |
| --- | --- | --- |
| `Maple-Sugar-FE` | `npm run dev` | Vite dev server, port 5173. |
| | `npm run build` | Production bundle in `dist/`. |
| | `npm run preview` | Serve the built bundle. |
| | `npm run lint` | ESLint. |
| | `npm test` | Vitest (`vitest run`). |
| `Maple-Sugar-BE` | `npm run dev` | `node --watch src/server.js`. |
| | `npm start` | Run without watch. |
| | `npm run migrate` | Apply SQL migrations only. |
| | `npm test` | Node test runner, `--test-concurrency=1`, `test/**/*.test.js`. |
| | `npm run lint` | ESLint. |
| | `npm run check-env` | Fails if `src/config.js` and `.env.example` list different variables. |
| | `npm run smoke` | `scripts/smoke.js` with `.env.test`. |
| | `npm run check-ingest [-- <baseUrl>]` | Posts one sample to a running API and reads it back (needs `GATEWAY_INGEST_TOKEN` and `JWT_SECRET` in `.env`). Defaults to `http://localhost:8080/api`. |

Tests need no Postgres, Redis, or Google (`test/env.js` sets fake values). Details: `Maple-Sugar-BE/docs/testing.md`.

## Previewing in Claude Code

`.claude/launch.json` (untracked) defines `frontend-mock`: Vite with `VITE_API_MODE=mock` on port 5174. Its paths are absolute to one machine; adjust before reuse.
