# Deployment and operations

## Deploy with Docker Compose

```bash
cp Maple-Sugar-BE/.env.example Maple-Sugar-BE/.env     # fill in; see configuration.md
docker compose up --build -d
docker compose ps
curl http://localhost:8080/api/health
```

Startup order (enforced by health checks): `db` healthy, `cache` started, `api` healthy (runs migrations, clears seed fixtures, promotes bootstrap admins, loads historic weather on first run), then `web`. The only published port is `8080` (nginx). Postgres and Redis are not exposed to the host.

Production values to set in `Maple-Sugar-BE/.env`:

- `PUBLIC_API_URL` and `PUBLIC_WEB_URL` to the public browser URL (for example `https://<host>/api` and `https://<host>`). Register matching redirect URIs in Google Cloud Console.
- A strong `JWT_SECRET`, `GATEWAY_INGEST_TOKEN`, Google client credentials, `OPENWEATHER_API_KEY`.
- Optionally SMTP and Twilio for critical alerts.
- TLS is not terminated by this compose file. **TODO**: document the reverse proxy or host used for the production URL (`https://maplesugaring01.webdev.gccis.rit.edu` is the ingest URL in the Pi config; the hosting setup is not described in the repo).

Update an existing deployment:

```bash
git pull
docker compose up --build -d      # migrations apply automatically on api start
```

Changing any `VITE_*` value requires rebuilding the web image.

Data: Postgres lives in the `postgres_data` volume. `docker compose down` keeps it; `docker compose down -v` deletes it. **TODO**: no backup procedure is documented or scripted.

The compose file is written to also run on a Raspberry Pi 5 (the web Dockerfile comments mention Debian on Pi 5). **TODO**: confirm the actual production host.

## Health and logs

- `GET /health` returns `{status, database, cache, uptimeSeconds}`. 200 when Postgres answers (Redis down is degraded, still 200), 503 when Postgres is down.
- `docker compose logs -f api` shows pino JSON logs. `/health` requests are not logged.
- Gateway status: the Deploy page lists each gateway with a status chip; ingest sets `last_ping` and Online.

## Operating the hardware

1. Register the gateway on Deploy (code matches the Pi's `GATEWAY_CODE`).
2. Add each tree, flash its board from Chrome (see [deploy-and-flasher.md](deploy-and-flasher.md)), tare with PRG.
3. On the Pi set `GATEWAY_INGEST_TOKEN` (same as the server), `FORWARD_TO_SERVER=1`, restart. Verify with the Pi page, then the dashboard.
4. `npm run check-ingest -- <baseUrl>` in `Maple-Sugar-BE` confirms the ingest route end to end.

Admins can change the sugarbush-wide report interval (`PATCH /settings`) and per-node intervals on Deploy; the server pushes the desired interval back through the Pi and gateway to the node.

## CI

All workflows are in `.github/workflows/` and use Node 22.

| Workflow | Triggers | Jobs |
| --- | --- | --- |
| `backend-ci.yml` "Backend CI" | push to `main`/`backend` and PRs touching `Maple-Sugar-BE/**` (or the workflow) | `npm run check-env`; `npm run lint`; `npm test`. |
| `frontend-ci.yml` "Frontend CI" | push to `main`/`backend` touching `Maple-Sugar-FE/**`; every pull request (it is a required check on `main`) | `npm run lint`; `npm test`; `npm run build`. |
| `discord-main-push.yml` "Notify Discord on main push" | push to `main` | Runs `.github/scripts/notify_discord.py`. |

Firmware builds and the Pi app are not built or tested in CI.

## Discord notification on push to main

Posts one message per push to `main` (not PRs or other branches) with the repository, the actor, and a link to the commit (`[<7-char sha>](.../commit/<sha>)`). Mentions are disabled (`allowed_mentions.parse = []`). The script sets a custom `User-Agent` because Discord rejected the default (commit `408580f`).

Setup (`.github/discord-notifications.md`):

1. In Discord: channel settings, Integrations, Webhooks, create a webhook, copy the URL.
2. In GitHub: Settings, Secrets and variables, Actions, new repository secret `DISCORD_WEBHOOK_URL`.
3. The next push to `main` posts. If nothing appears, check the Actions run. Without the secret the script exits with an instruction to set it.

Treat the webhook URL as a secret. The script reports only an HTTP status or "network error" on failure.

## Security checklist before going live

- `JWT_SECRET` and `GATEWAY_INGEST_TOKEN` generated fresh, not shared in chat or committed.
- Google OAuth client secret rotated if it was ever shared.
- `ALLOWED_EMAIL_DOMAINS` set as intended; `BOOTSTRAP_ADMIN_EMAILS` reviewed (those accounts become Admin on every boot).
- Remove `Maple-Sugar-FE/.vscode/github-accounts.json` from the repository (it contains GitHub account identifiers and a session id; see [HANDOFF.md](HANDOFF.md)).
- Do not build the web image with `VITE_API_MODE=mock` for production (it would show mock logins and use fixtures).
- The compose database credentials (`maple`/`maple`) are only reachable on the internal Docker network; change them if that network is ever exposed.
