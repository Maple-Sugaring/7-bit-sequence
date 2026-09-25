# 🍁 7-Bit Sequence

**A field-to-dashboard system for the RIT Maple Sugaring program.** Track sap collection, sensor readings, alerts, and volunteer shifts in one place.

| Service | Stack | Purpose |
| --- | --- | --- |
| `web` | React, Vite, Material UI, nginx | Dashboard and field workflows |
| `api` | Express | Authentication and application API |
| `db` | PostgreSQL 17 | Persistent data |
| `cache` | Redis 7 | Optional read-through cache |

The root [Compose file](docker-compose.yml) builds and runs the full stack at **<http://localhost:8080>**.

## ✨ What you can do

- Monitor node health, sap weight, temperature, sugar content, and weather.
- Record sap readings and collection logs, review alerts, and manage volunteer shifts.
- Filter readings and export CSV files.
- Control access with invited Google accounts and Admin, Student, and MSS roles.

## 🚀 Run the full stack

You need Docker Desktop (or Docker Engine with the Compose plugin) and a Google OAuth web client. Run the following commands from the repository root.

### 1. Configure the API

Copy the [backend environment template](Maple-Sugar-BE/.env.example) to `Maple-Sugar-BE/.env`:

```sh
cp Maple-Sugar-BE/.env.example Maple-Sugar-BE/.env
```

Set these values in `Maple-Sugar-BE/.env`:

| Setting | Docker value or action |
| --- | --- |
| `JWT_SECRET` | Generate a random secret of at least 32 characters, for example with `openssl rand -base64 48`. |
| `GOOGLE_CLIENT_ID` | Your Google OAuth web client ID. |
| `GOOGLE_CLIENT_SECRET` | The matching client secret. |
| `PUBLIC_API_URL` | `http://localhost:8080/api` |
| `PUBLIC_WEB_URL` | `http://localhost:8080` |

Use the browser-facing host instead of `localhost` in both URLs if teammates open the site from another machine. Keep the URL and Google OAuth redirect settings in sync.

Register these **authorized redirect URIs** on the Google OAuth client:

```text
http://localhost:8080/api/auth/google/callback
http://localhost:8080/api/auth/google/calendar/callback
```

If you use a different host, replace `localhost` in both URIs. Calendar sync also needs the Google Calendar API and the `https://www.googleapis.com/auth/calendar.events` scope.

> [!IMPORTANT]
> Keep `Maple-Sugar-BE/.env` out of Git. Compose supplies `NODE_ENV`, `PORT`, `DATABASE_URL`, `REDIS_URL`, and bootstrap admin addresses; you do not need to set them in the env file.

### 2. Build and start

Start the stack in detached (headless) mode:

```sh
docker compose up --build -d
```

For later starts that do not need a rebuild, run `docker compose up -d`.

Open **<http://localhost:8080>**. On first start, the API applies migrations and seeds data; the web service waits for the API health check. The addresses in `BOOTSTRAP_ADMIN_EMAILS` in [`docker-compose.yml`](docker-compose.yml) are promoted to Admin on API startup. Other accounts must be invited before they can sign in.

### 3. Check the stack

```sh
docker compose ps
docker compose logs --tail=100 api web
```

The public health endpoint is **<http://localhost:8080/api/health>**. PostgreSQL must be healthy; Redis can be unavailable while the API serves data directly from PostgreSQL.

To stop the stack:

```sh
docker compose down
```

Compose stores PostgreSQL data in the `postgres_data` volume, which `docker compose down` preserves.

## 🧭 App routes

| Route | What you can do |
| --- | --- |
| `/login` | Sign in with Google |
| `/dashboard` | See field status, node gauges, and forecasts |
| `/schedule` | View and claim collection shifts |
| `/collection` | Record sap readings and collection logs |
| `/table` | Filter readings and export CSV |
| `/notifications` | Review and resolve alerts |
| `/schedule-admin` | Manage collection tasks and shifts (Admin) |
| `/admin` | Invite and manage users (Admin) |

Access depends on role and capability. `/input` redirects to `/collection` for older links.

## ⚙️ Docker configuration

- The browser calls `/api/...`; nginx forwards those requests to the Express service and removes the `/api` prefix.
- Compose fixes the frontend build to HTTP API mode and `/api`. No frontend `.env` file is needed for the Docker stack.
- The backend env template restricts `ALLOWED_EMAIL_DOMAINS` to `g.rit.edu,rit.edu`.
- `OPENWEATHER_API_KEY` enables live weather when provided. `GATEWAY_INGEST_TOKEN` enables authenticated sensor uploads. Leave either blank if that integration is not part of your test.
- `SUGARBUSH_LATITUDE`, `SUGARBUSH_LONGITUDE`, and `SESSION_TTL_DAYS` have application defaults; change them only when your deployment needs different values.

For the architecture and API, see the [backend documentation](Maple-Sugar-BE/docs/README.md) and [API guide](Maple-Sugar-BE/docs/api.md).
