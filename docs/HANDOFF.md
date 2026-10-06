# Handoff status

## Docs sync marker

Documentation was last synced to commit:

```
ca2e1704d24cbbc9fb597e22aff3655b6b0fc9c9
```

(branch `32-sponsor-report-demo-branch`, same commit as `main`, "Real field data: Deploy, Heltec flasher, Pi gateway, and schedule polish (#26)", 2026-10-05). Working tree at sync time: only untracked `.claude/` and `docs/`.

To refresh the docs, run `git diff ca2e1704d24cbbc9fb597e22aff3655b6b0fc9c9 --stat` (and `git diff` on the changed files) and update only the affected pages. Then replace the hash above.

## What exists and works (verified in code)

- Web app with Google sign-in or mock mode, role-based pages, dashboard, node pages, collection logging with offline queue, sugar data table with CSV export, notifications, schedule and schedule admin, user admin.
- Mock logins for each role (issue #23), only in `VITE_API_MODE=mock`. See [roles-and-logins.md](roles-and-logins.md).
- Deploy page: register gateways, add/edit/delete nodes, flash and erase Heltec boards from the browser. See [deploy-and-flasher.md](deploy-and-flasher.md).
- Heltec node, gateway, and HX711 test firmware; Raspberry Pi gateway app. See [hardware.md](hardware.md).
- API ingest with gateway token, dedupe, faults, interval push-back, and a disk spool when Postgres is down.
- Background jobs: live weather, offline-node alerts, buffer replay.
- Optional email and SMS for critical alerts.
- CI: backend (env sync, lint, tests), frontend (lint, tests, build), Discord notification on pushes to `main`.

## In progress or not confirmed

The working tree has no uncommitted source changes, so nothing is "half edited". The items below are inferred from the repo and need an owner to confirm.

| Item | Evidence | Status |
| --- | --- | --- |
| Branch `32-sponsor-report-demo-branch` | Current branch; identical to `main` at sync time. Name suggests a sponsor report and demo. | TODO: confirm purpose and what should land here. |
| Remote branch `30-email-notifications` | Has commits not in `main` ("Email notifications, user profiles, and Docker permission fix"). `notificationService.js` is already in `main`. | TODO: confirm what remains unmerged (user profiles?). |
| Remote branch `31-edit-gateway-deployments` | One commit not in `main` ("Edit and delete gateway deployments, map location picker, gateway cards"). | TODO: confirm whether to merge; the Deploy page in `main` has node edit/delete and a lat/long form but no map picker. |
| Other remote branches | `auth-bypass-dev`, `feature/auth-token-refresh`, `backend-documentation`, `issue21-notifroute`, and several `issue-*` and `codex/*` CI branches. | Not reviewed. |
| Firmware publishing | No script rebuilds and copies `Maple-Sugar-FE/public/firmware/*`. | TODO: script or document it. |
| Pi service | No systemd unit or auto-start in repo. | TODO. |
| Pi offline buffering | Pi retries 3 times then drops the reading. | TODO: decide if acceptable. |
| Backups and TLS | Not covered by compose or docs. | TODO. |
| Student and MSS account expiry defaults | `business.md` has "(120?)" and "(1 year?)". No code sets defaults. | TODO: confirm with instructor. |
| Student shift claim approval | `business.md` says instructor approves; code signs up immediately. | TODO. |
| `liveWeight.js` fixed to 2026 and nodes 1 and 2 | `LIVE_YEAR`, `LIVE_NODE_IDS`. | TODO for the next season. |
| `societies` table | In baseline DDL, not read by the API. | Unused. |

## Known documentation drift

Existing docs that no longer match the code (not edited here; this docs set is the corrected description):

| File | Drift |
| --- | --- |
| `README.md` (root) | Describes dummy sap readings (quarter gallon per packet, 8.34 lb/gal) and a `FILL_START_STEPS` demo. The node firmware now reads a real HX711 load cell; `FILL_START_STEPS` is defined but unused. Also mentions two flashed nodes `node_001`/`node_002` and does not mention the Deploy flasher or the `field` build. |
| `README.txt` (root) | Route list omits `/deploy`, `/nodes` management, `/gateways` POST, `/ingest`, `/weather`, `/journal`, `/settings`, `/schedule/availability` and `claim-time`. Page list omits `/deploy`. Says `/input` is a route (now a redirect to `/collection`). Says "this frontend/ directory" (it is the repo root). |
| `Maple-Sugar-BE/docs/ddl.md` | Written "after 008"; does not cover 009 (tracked flag), `010_node_deploy` (`rf_tag`, `notes`), `010_drop_seed_metrics`, `011_drop_seed_alerts`. |
| `Maple-Sugar-BE/docs/api.md` | Missing `POST /gateways`, `POST /nodes`, `DELETE /nodes/:id`, `PATCH /nodes/:id/details`, `PATCH /nodes/:id/interval`, `Fault`, `Desired_Interval_Seconds`, 202 `Buffered`. |
| `Maple-Sugar-BE/docs/business.md` and `services.md` | No mention of `nodeWatch`, `housekeeping`, `readingBuffer`, `notificationService`, `clearSeed`, or the `deploy_nodes` capability. |
| `Maple-Sugar-FE/README.md` | Vite template leftovers. |
| `gateway/raspberry-pi/README.md` | Says lines arrive every 10 seconds; node default is 20 s (the `field` build) and the server can change it. |

## Repository hygiene items

- `Maple-Sugar-FE/.vscode/github-accounts.json` is tracked and holds GitHub usernames, emails, account ids, and a session id. Remove it from git (it is already covered by `.vscode` in `.gitignore`). Not copied into these docs.
- `Maple-Sugar-FE/.env` is tracked (contains no secrets, only `VITE_*` defaults and `API_UPSTREAM`) while `.env` is git-ignored at the root; it was committed earlier. Prefer `.env.local`.
- `docker-compose.yml` hard-codes seven bootstrap admin emails for the `api` service, overriding `.env`. Change that list there.
- `.claude/launch.json` is untracked and has machine-specific absolute paths.
- `platformio.ini` files pin a Mac serial port.

## Where to look first

1. `docker-compose.yml`, `Maple-Sugar-BE/src/server.js`, `Maple-Sugar-BE/src/config.js`.
2. `Maple-Sugar-BE/src/routes/ingest.js`, `services/ingestService.js` (the hardware path).
3. `Maple-Sugar-FE/src/routes/AppRoutes.jsx`, `business/permissions.js`, `pages/DeployPage.jsx`, `hardware/heltecFlash.js`.
4. `firmware/heltec-v3-node/src/main.cpp`, `gateway/raspberry-pi/receiver.py`.
