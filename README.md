# Maple Sugaring

Monitoring system for the RIT Maple Sugaring program (7-Bit Sequence, ISTE 501). LoRa sap-bucket nodes report weight and battery to a gateway, a Raspberry Pi forwards readings to an API, and a web app shows sap status, alerts, collection logs and volunteer shifts.

```
Heltec node --LoRa--> Heltec gateway --USB--> Raspberry Pi --HTTPS--> Express API <--> React web app
                                                                          |
                                                                  Postgres + Redis
```

| Folder | What it is |
| --- | --- |
| `Maple-Sugar-FE/` | React + Vite web app (Material UI, RIT theme) |
| `Maple-Sugar-BE/` | Express API with Postgres, Redis and Google sign-in |
| `firmware/` | PlatformIO firmware for the Heltec WiFi LoRa 32 V3 nodes and gateway |
| `gateway/raspberry-pi/` | Pi app that reads the gateway over USB and POSTs to `/api/ingest` |
| `terraform/` | EC2 production deployment (Caddy, Compose, S3 backups) |
| `docs/` | Architecture, setup, operations, configuration, troubleshooting, handoff |

## What the app does

Sign-in is Google OAuth, limited to invited accounts on `g.rit.edu` and `rit.edu` by default. Pages are gated by role:

| Role | Access |
| --- | --- |
| Admin | Everything: users, schedule management, data edits |
| Student | Dashboard, recording, readings table, alerts, claiming shifts |
| MSS | Dashboard and readings table (with CSV export) for outreach review |

Main routes: `/dashboard`, `/schedule`, `/input`, `/table`, `/notifications`, `/collection`, plus Admin-only `/admin` and `/schedule-admin`. The full list is in [docs/frontend.md](docs/frontend.md).

## Quick start

Requirements: Node.js 22+, npm. Docker Desktop for the full stack.

Pick the mode that fits what you are doing.

### A. UI only, mock data (no backend, no credentials)

```bash
cd Maple-Sugar-FE
cp .env.example .env.local     # then set VITE_API_MODE=mock
npm install
npm run dev
```

Open http://localhost:5173 and pick a role on the login screen. Data comes from `src/data/transports/mockTransport.js` and resets on reload.

### B. Mock mode in Docker

```bash
docker build --build-arg VITE_API_MODE=mock -t maple-sugar-demo ./Maple-Sugar-FE
docker run --rm -p 8081:80 --name maple-sugar-demo maple-sugar-demo
```

Open http://localhost:8081. The `--build-arg` is required because Docker ignores `.env`. See [DEMO.md](DEMO.md) for mock vs hybrid demo modes.

### C. Full stack in Docker (real API)

```bash
cp Maple-Sugar-BE/.env.example Maple-Sugar-BE/.env
# fill in GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, and set
# PUBLIC_API_URL=http://localhost:8080/api, PUBLIC_WEB_URL=http://localhost:8080
# JWT_SECRET can be blank for local development; production gets it through SSM.
docker compose up --build
```

Open http://localhost:8080. Register `http://localhost:8080/api/auth/google/callback` as a redirect URI on the Google OAuth client. Compose runs Postgres 17, Redis 7, the API, and nginx serving the built UI and proxying `/api`. Set `BOOTSTRAP_ADMIN_EMAILS` so someone can sign in and invite everyone else.

### D. Local dev against a local API

Needs Postgres (database `maple_sugaring`); Redis is optional.

```bash
cd Maple-Sugar-BE && cp .env.example .env && npm install && npm run dev   # :3000, migrations run on boot
cd Maple-Sugar-FE && cp .env.example .env.local && npm install && npm run dev   # :5173, VITE_API_MODE=http
```

Set `PUBLIC_API_URL=http://localhost:5173/api` and `PUBLIC_WEB_URL=http://localhost:5173` in the backend `.env`, and register `http://localhost:5173/api/auth/google/callback` with Google. Step-by-step detail is in [docs/setup-development.md](docs/setup-development.md).

## How the API is addressed

The browser always calls `/api/...`. Vite's dev proxy and nginx strip the `/api` prefix, so Express mounts its routes at the root (`/metrics`, `/auth`, `/schedule/slots`, ...). Browser sessions use a short-lived JWT access-token cookie and a rotating refresh token backed by Postgres; refresh-token hashes are stored server-side. JSON field names such as `Node_Code` and `Recorded_At` are the API contract; do not rename them.

`VITE_API_MODE` (`http` or `mock`) is the only switch between the real API and the in-memory mock. Vite inlines every `VITE_*` value at build time, so changing it after a Docker build means rebuilding the web image.

## Common commands

| Where | Command | Does |
| --- | --- | --- |
| `Maple-Sugar-FE` | `npm run dev` / `build` / `preview` / `lint` | Dev server, production bundle, serve bundle, ESLint |
| `Maple-Sugar-BE` | `npm run dev` / `start` | API with or without `--watch` |
| `Maple-Sugar-BE` | `npm run migrate` | Apply SQL migrations only |
| `Maple-Sugar-BE` | `npm test` / `npm run smoke` / `npm run lint` | Tests, smoke script, ESLint |

## Hardware

Two Heltec nodes send sap readings over LoRa (not LoRaWAN: 915.125 MHz, SF9, BW 125 kHz, CR 4/5, sync word 0x12) to a third Heltec acting as the gateway, which is plugged into a Raspberry Pi over USB.

```bash
cd firmware/heltec-v3-node    && pio run -e node_001 -t upload   # then node_002; antenna on first
cd firmware/heltec-v3-gateway && pio run -e gateway  -t upload
```

The Pi app is set up from [gateway/raspberry-pi/README.md](gateway/raspberry-pi/README.md). Leave `FORWARD_TO_SERVER=0` until the Pi's status page at `http://<pi-ip>:8080` shows **Link up** and both node codes, then set `FORWARD_TO_SERVER=1` and `GATEWAY_INGEST_TOKEN` to the server's value. The Pi POSTs to `<server>/api/ingest` with an `X-Gateway-Token` header; this is a gateway token, not a user JWT. Wiring, payloads and troubleshooting are in [docs/hardware.md](docs/hardware.md).

If packets never appear: antennas on all three boards, the serial device exists (`ls -l /dev/ttyACM0`, or set `GATEWAY_SERIAL`), and the gateway user is in the `dialout` group.

## Deployment

Production runs on one EC2 instance provisioned with Terraform: Caddy terminates HTTPS, then nginx forwards `/api` to Express. See [terraform/README.md](terraform/README.md) for the first deployment, GitHub Actions, backups and recovery, and [docs/operations.md](docs/operations.md) for CI and day-to-day operations. Never build the production web image with `VITE_API_MODE=mock`.

## Documentation

Start at [docs/README.md](docs/README.md).

| Topic | Doc |
| --- | --- |
| How the pieces fit | [docs/architecture.md](docs/architecture.md) |
| Environment variables | [docs/configuration.md](docs/configuration.md) |
| Roles and mock logins | [docs/roles-and-logins.md](docs/roles-and-logins.md) |
| Broken something | [docs/troubleshooting.md](docs/troubleshooting.md) |
| Taking over the project | [docs/HANDOFF.md](docs/HANDOFF.md) |
| Backend reference (schema, routes, repositories) | [Maple-Sugar-BE/docs/](Maple-Sugar-BE/docs/README.md) |

## Notes

- Do not commit real secrets. Copy `Maple-Sugar-BE/.env.example` to `.env` and `Maple-Sugar-FE/.env.example` to `.env.local`.
- A Redis outage degrades the API but is not fatal; Postgres down makes `/health` return 503.
- Expired or inactive accounts cannot sign in even if their role would allow it.
