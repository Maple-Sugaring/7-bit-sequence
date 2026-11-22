# Handoff status

## Docs sync marker

The pages in `docs/` were last fully synced to commit:

```
ca2e1704d24cbbc9fb597e22aff3655b6b0fc9c9
```

("Real field data: Deploy, Heltec flasher, Pi gateway, and schedule polish (#26)", 2026-10-05). Since then, `backend.md`, `frontend.md`, `deploy-rles.md`, `hardware.md` and `deploy-and-flasher.md` have had partial updates, but no page-by-page review has been done.

This file and [CHANGELOG.md](CHANGELOG.md) were checked against `main` at `854d354` ("redesign recent collections list (#154)", 2026-11-18).

To refresh the docs, run `git diff ca2e1704d24cbbc9fb597e22aff3655b6b0fc9c9 --stat` (and `git diff` on the changed files) and update only the affected pages. Then replace the hash above.

## What exists and works (verified in code)

- Web app with Google sign-in or mock mode, role-based pages, dashboard, node pages, fleet status map, Sugar Woods table with CSV and PDF export, notifications, combined Schedule page, user admin, landing page, dark mode, guided walkthrough tour and tutorials.
- Auth: 15-minute access token plus a 30-day refresh token stored in `sessions` (rotation, reuse detection, log out everywhere).
- Mock logins for each role (issue #23), only in `VITE_API_MODE=mock`. See [roles-and-logins.md](roles-and-logins.md).
- Collection: round-based entry grouped by stand, sap weight entered with the bucket tared in JS, ice reweigh (#150), drafts kept per tree, offline queue, and a recent list grouped by day. Shelf life is tracked per bucket batch.
- Measurement corrections with an append-only `audit_events` table (`GET /audit-events`). A site-wide test/production data mode (`/settings/data-mode`) keeps test data and alerts out of production views.
- Sap data page with a year-to-year comparison and a sum across nodes (#152). Metric aggregation keeps history through retention (migration 018).
- Deploy page: register, edit and delete gateways (with a map picker) and nodes, flash and erase Heltec boards from the browser, calibrate load cells over LoRa (tare, test weight, cancel), and a sensor lifecycle card. See [deploy-and-flasher.md](deploy-and-flasher.md).
- Node firmware 2.0 (confirmed faults, battery telemetry, service/field modes, host unit tests), gateway firmware, HX711 test firmware, and the Raspberry Pi gateway app. `firmware/heltec-v3-node/scripts/publish-web-flasher.sh` publishes the browser flasher image. See [hardware.md](hardware.md).
- API ingest with gateway token, dedupe, faults, interval and calibration downlinks, and a disk spool when Postgres is down.
- Background jobs: live weather, offline-node alerts, alert escalation, shift reminders, buffer replay, metric retention.
- Email through the Gmail API (SMTP and SMS remain as options) for alerts, escalations and shift reminders, with per-user preferences.
- Deploy: RLES server through a manual GitHub Actions workflow on a self-hosted runner (`deploy/rit/`, [deploy-rles.md](deploy-rles.md)); mock frontend on Vercel from `main`. AWS is retired and Terraform is manual.
- CI: backend (env sync, lint, tests), frontend (lint, tests, build), Discord notification on pushes to `main`.

## In progress or not confirmed

The items below are inferred from the repo and need an owner to confirm.

### Open branches with work not in `main`

| Branch | What it adds | Status |
| --- | --- | --- |
| `#61_Complete_Invalid-input,device-fault_and_admin_recovery_workflows` | 8 commits (2026-11-11), 12 files, mostly the mock API and the frontend: 422 validation on mock `POST /metrics`, a Collection Needed level at 75%, stale-weight warnings, load-cell faults marking a node degraded, a reusable `ConfirmDialog`, and mock audit events. | TODO: review and open a PR. |
| `106-bulk-add-students` | 5 commits (to 2026-11-17): a CSV upload dialog on the Admin page with validation. | TODO: finish and open a PR. |
| `issue-54/consistent-timestamps` | 4 commits (2026-11-12), 41 files: operation timestamps, activity trace middleware and `/activity-events`, an audit log view, and Pi receiver changes. | TODO: rebase before merging. Its `026_operation_timestamps.sql` uses the same number as `026_collection_weight_before_ice.sql`, which is already on `main` (#150). |

### Stale branches

Most of the other remote branches (about 35) are the source branches of squash-merged PRs. For example, `feature/126-node-firmware-revamp`, `issue-49/audit-corrections-and-data-modes`, `68-data-comp` and `fix/collection-stands-tare-drafts` have all landed. `31-edit-gateway-deployments` and `32-sponsor-report-demo-branch` landed through #74; the only leftover on 31 is a duplicate `/nodes/board` mock route. `feature/auth-token-refresh` and `issue21-notifroute` landed as direct commits.

TODO: confirm with each author and delete them.

### Other open items

| Item | Evidence | Status |
| --- | --- | --- |
| Duplicate migration number 019 | `019_measurement_corrections.sql` (#142) and `019_sensor_lifecycle.sql` (#62). Both run because the runner records by filename. | Works, but confusing. Do not renumber files that have already been applied. |
| Pi service | The Pi README mentions `maple-gateway.service`, but no unit file is in the repo. Only `deploy/rit/maple-deploy.{service,timer}` exist (for the server). | TODO: add the unit. |
| Pi offline buffering | `receiver.py` retries `POST_ATTEMPTS = 3` times, then drops the reading. | TODO: decide if this is acceptable. |
| Backups and TLS | TLS is terminated by RIT's reverse proxy (`compose.rit.yml`). There is no database backup in compose or the docs. | TODO: backups. |
| Student and MSS account expiry | `business.md` still says "(120?)" days and "(1 year?)". The code defaults invited students to 4 months (`DEFAULT_EXPIRY_MONTHS` in `routes/users.js`) and sets no MSS default. | TODO: confirm with the instructor and fix `business.md`. |
| Student shift claim approval | `business.md` says the instructor approves. The code (`POST /schedule/slots/:id/claim-time`) signs the student up immediately. | TODO. |
| `liveWeight.js` fixed to 2026 and nodes 1 and 2 | `LIVE_YEAR`, `LIVE_NODE_IDS`. | TODO for the next season. |
| `societies` table | In the baseline DDL, not read by the API. | Unused. |

## Known documentation drift

Existing docs that no longer match the code:

| File | Drift |
| --- | --- |
| `README.md` (root) | Still has the `pio run -e node_001` / `node_002` flashing steps. Does not mention the Deploy flasher, the `field` build, or firmware 2.0. |
| `README.txt` (root) | Route list is out of date (no `/deploy`, `/ingest`, calibration, audit or settings routes). Still lists `/input` as a page (it now redirects to `/collection`). |
| `Maple-Sugar-BE/docs/ddl.md` | Still describes the schema "after `008_three_trees.sql`". Missing migrations 009 to 026 (`rf_tag`, profiles, sessions, `calibration_commands`, metric aggregates, `audit_events`, `sensor_lifecycle_events`, `site_data_mode`, ice reweigh). |
| `Maple-Sugar-BE/docs/api.md` | Now covers gateways, node details, interval and calibration. Still missing `GET /nodes/lifecycle`, `POST /nodes/:id/lifecycle`, `GET /audit-events`, and `GET`/`PATCH /settings/data-mode`. |
| `Maple-Sugar-BE/docs/business.md` | Expiry placeholders and shift approval (see above). |
| `Maple-Sugar-FE/README.md` | Vite template leftovers. |
| `gateway/raspberry-pi/README.md` | Says lines arrive "about every 10 seconds"; the interval is set per node from the server (10 s to 24 h). There is an uncommitted edit to this file on `documentation-updating`. |

## Repository hygiene items

- `Maple-Sugar-FE/.vscode/github-accounts.json` is still tracked and holds GitHub usernames, emails, account ids, and a session id. Remove it from git (`.vscode` is already in `.gitignore`).
- `Maple-Sugar-FE/.env` is still tracked (no secrets, only `VITE_*` defaults and `API_UPSTREAM`). Prefer `.env.local`.
- `docker-compose.yml` hard-codes seven `BOOTSTRAP_ADMIN_EMAILS` for the `api` service, overriding `.env`. Change that list there.
- All three `platformio.ini` files pin the Mac serial port `/dev/cu.usbserial-0001`.

## Where to look first

1. `docker-compose.yml`, `deploy/rit/`, `Maple-Sugar-BE/src/server.js`, `Maple-Sugar-BE/src/config.js`.
2. `Maple-Sugar-BE/src/routes/ingest.js`, `services/ingestService.js` (the hardware path), `routes/nodes.js` (calibration, lifecycle).
3. `Maple-Sugar-FE/src/routes/AppRoutes.jsx`, `business/permissions.js`, `pages/DeployPage.jsx`, `pages/CollectionPage.jsx`, `hardware/heltecFlash.js`.
4. `firmware/heltec-v3-node/src/` (firmware 2.0 modules), `gateway/raspberry-pi/receiver.py`.
