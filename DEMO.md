# Sponsor demo

This branch (`32-sponsor-report-demo-branch`) shows the app as it will look once the hardware is deployed: 12 trees on three campus sites, four gateways, a month of weight readings, alerts, shifts, a journal, a roster and live weather. All of it is sample data.

There are two ways to run it. Pick one.

| | Mock mode | Hybrid mode |
| --- | --- | --- |
| Needs a backend, database or credentials | No | Yes (Google OAuth, Brevo) |
| Sign in | Role buttons: Administrator, Student, MSS Member | Real RIT Google account |
| Sensor screens (The Bush, Sugar Woods, Alerts, Deploy, Collection) | Sample data | Sample data |
| Schedule, Google Calendar, email | Sample data, nothing is sent | Real: shifts create calendar events and send emails |
| Port | 8081 | 8082 |

## Mock mode (no setup)

Run from the repo root.

```bash
docker build --build-arg VITE_API_MODE=mock -t maple-sugar-demo ./Maple-Sugar-FE
docker run --rm -p 8081:80 --name maple-sugar-demo maple-sugar-demo
```

Open http://localhost:8081 and pick a role. Press Ctrl+C to stop; the container removes itself.

- The `--build-arg` is required. Docker ignores `.env`, so without it the image defaults to the real API and Google login.
- Port 8081 avoids the normal stack on 8080. Use `-p 8080:80` if that stack is stopped.
- After code changes, rebuild and restart. Add `--no-cache` to the build if you still see old behaviour.
- A full page reload resets anything you changed, because the data lives in the browser's memory. The login survives a reload.
- `/api` returns 502 in this container. That is expected; mock mode never calls it.

Without Docker: `cd Maple-Sugar-FE && npm install && npm run dev`. The tracked `.env` on this branch already sets `VITE_API_MODE=mock`.

### What each login shows

| Login | Lands on | Can see |
| --- | --- | --- |
| Administrator (Tom Palmer) | The Bush | everything |
| Student (Maya Okafor) | The Bush | Schedule, Collection, Sugar Woods, Notifications. Own journal entries and shifts. |
| MSS Member (Sofia Delgado) | The Bush | The Bush, Deploy, Sugar Woods only |

## Hybrid mode (real calendar and email)

Sensor screens stay on sample data. Sign-in, profile and email preferences, and the Schedule use the real API. Claiming a shift puts an event on your Google Calendar and emails you.

This mode cannot work in the browser alone: calendar needs a real Google refresh token, and email needs the Brevo key, which must stay on a server.

### One-time setup

1. In `Maple-Sugar-BE/.env`, set real values for:
   - `JWT_SECRET`
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
   - `BREVO_API_KEY` and `MAIL_FROM` (a sender verified in Brevo)
2. In Google Cloud Console, open the OAuth client and add this redirect URI:
   `http://localhost:8082/api/auth/google/callback`
   Also make sure the Google Calendar API is enabled and the consent screen has the scopes `calendar.events` and `calendar.freebusy`.
3. Decide which Google account you will sign in with. It must be an `@rit.edu` or `@g.rit.edu` address that is either invited on the Admin page or listed in `BOOTSTRAP_ADMIN_EMAILS` (the team is already listed in `docker-compose.yml`).

### Run

```bash
docker compose -p maple-demo -f docker-compose.yml -f docker-compose.demo.yml up -d --build

docker compose -p maple-demo -f docker-compose.yml -f docker-compose.demo.yml exec -T db \
  psql -U maple -d maple_sugaring < Maple-Sugar-BE/demo/demo-seed.sql
```

The second command adds the nodes, buckets and shifts the schedule needs. It is safe to run twice. Wait for the API to finish starting before running it (check with `docker compose -p maple-demo -f docker-compose.yml -f docker-compose.demo.yml ps`; the `api` service should be healthy).

Open http://localhost:8082 and sign in with Google.

### Stop

```bash
docker compose -p maple-demo -f docker-compose.yml -f docker-compose.demo.yml down
```

Add `-v` to also delete the demo database.

### Things to know

- **Separate stack.** The `-p maple-demo` project has its own containers and database volume, so your normal stack on 8080 is untouched.
- **Never run `demo-seed.sql` against the live database.** It claims node ids 1 to 12 and bucket ids 1 to 14 so they line up with the sample data, and would collide with real registered nodes.
- **No role buttons.** Real Google sign-in is used. For a Student view, invite a second real account on the Admin page and sign in with it.
- **Schedule contents.** The Schedule shows the real shifts from the SQL seed (10 upcoming, 2 waiting for a time), not the sample shifts from mock mode.
- **Emails that fire.** Shift signups, changes and reminders, and the admin test email on the Profile page. Critical-alert emails do not fire, because alerts are sample data in this mode.

## What the sample data covers

- **Hardware:** 12 trees across Alumni House, Chabad House and Red Barn, with every state at least once: full bucket, iced bucket past 10 gal, maintenance, low battery with weak signal, offline, and never reported. Four gateways, one offline.
- **Readings:** 30 days of weight history, plus Brix and sap-temperature checks that drive the spoilage alert and shelf life.
- **Alerts:** every alert type, open and resolved, fresh and escalated.
- **Schedule:** past, today, upcoming, full, overlapping, and waiting for a time.
- **People:** a roster with locked, expired, expiring-soon and invite-pending accounts, plus pronouns.
- **Weather:** a six-day freeze-thaw forecast. October would not really run sap, so this is a deliberate demo scenario.

All timestamps are computed when the page loads, so the demo always looks current.

## Known limits

- The weight charts hardcode calendar 2026 (`Maple-Sugar-FE/src/business/liveWeight.js`) and go empty on 2027-01-01.
- Sugar Woods can drop the newest readings when viewed after about 8 PM Eastern, because it compares a UTC date to a local date.
- Web Serial firmware flashing and phone push notifications cannot be shown from sample data.
- The Profile page logs a React `inputProps` warning in the browser console. It comes from the profile page itself, not the demo data.

## Where things live

| Path | What it is |
| --- | --- |
| `Maple-Sugar-FE/src/data/fixtures/seed.js` | The sample data |
| `Maple-Sugar-FE/src/data/transports/mockTransport.js` | The in-memory API |
| `Maple-Sugar-FE/src/data/transports/hybridTransport.js` | Routes calendar, email and schedule to the real API |
| `docker-compose.demo.yml` | Hybrid demo stack overrides (port 8082) |
| `Maple-Sugar-BE/demo/demo-seed.sql` | Real-database rows for hybrid mode |
