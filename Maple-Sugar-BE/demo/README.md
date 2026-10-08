# Hybrid sponsor demo

Sensor screens (The Bush, Sugar Woods, alerts, Deploy) run on mock data. Sign-in, the
schedule, Google Calendar and email use the real API, so claiming a shift puts an
event on your Google Calendar and emails you.

## One-time setup
1. `Maple-Sugar-BE/.env` needs real values for `JWT_SECRET`, `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `BREVO_API_KEY` and `MAIL_FROM` (a Brevo-verified sender).
2. In Google Cloud Console, add this redirect URI to the OAuth client:
   `http://localhost:8082/api/auth/google/callback`
   (Calendar API enabled; scopes `calendar.events` and `calendar.freebusy` on the consent screen.)
3. Sign in with an `@rit.edu` / `@g.rit.edu` account that is invited or listed in
   `BOOTSTRAP_ADMIN_EMAILS`.

## Run
```bash
docker compose -p maple-demo -f docker-compose.yml -f docker-compose.demo.yml up -d --build
docker compose -p maple-demo -f docker-compose.yml -f docker-compose.demo.yml exec -T db \
  psql -U maple -d maple_sugaring < Maple-Sugar-BE/demo/demo-seed.sql
```
Open http://localhost:8082. Stop with `docker compose -p maple-demo -f docker-compose.yml -f docker-compose.demo.yml down`
(add `-v` to wipe the demo database).

The `-p maple-demo` project keeps its own database, so your normal stack on :8080 is untouched.
