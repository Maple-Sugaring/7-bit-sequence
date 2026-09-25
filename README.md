# 🍁 7-Bit Sequence

**A field-to-dashboard system for the RIT Maple Sugaring program.** Track sap collection, sensor readings, alerts, and volunteer shifts in one place.

| App | Stack | Purpose |
| --- | --- | --- |
| [Frontend](Maple-Sugar-FE/) | React, Vite, Material UI | Dashboards, data entry, schedules, and administration |
| [Backend](Maple-Sugar-BE/) | Express, PostgreSQL, Redis | API, authentication, persistence, and integrations |

The root [Compose file](docker-compose.yml) runs both apps behind nginx at **<http://localhost:8080>**.

## ✨ Features

- **Live field view:** node health, sap weight, temperature, sugar content, and weather.
- **Collection workflow:** record readings and collection logs, review alerts, and manage shifts.
- **Role-based access:** Admin, Student, and MSS views, with invited Google accounts.
- **Data review:** filter readings and export them as CSV.
- **Mock mode:** explore and develop the UI without a database, API, or Google credentials.

## 🚀 Get started

You need **Node.js 22+** and npm. The full stack also needs Docker Desktop. For a local API, use PostgreSQL; Redis is optional.

### Frontend with mock data

```sh
cd Maple-Sugar-FE
cp .env.example .env.local
# In .env.local, set VITE_API_MODE=mock
npm install
npm run dev
```

Open **<http://localhost:5173>**. Mock fixtures live in [`mockTransport.js`](Maple-Sugar-FE/src/data/transports/mockTransport.js).

### Frontend and API locally

1. Create a PostgreSQL database named `maple_sugaring`.
2. Copy [`Maple-Sugar-BE/.env.example`](Maple-Sugar-BE/.env.example) to `Maple-Sugar-BE/.env`. Set `DATABASE_URL` to your local database, generate `JWT_SECRET` with `openssl rand -base64 48`, and supply a Google OAuth web client ID and secret. Set `PUBLIC_API_URL=http://localhost:5173/api` and `PUBLIC_WEB_URL=http://localhost:5173`.
3. Register `http://localhost:5173/api/auth/google/callback` and `http://localhost:5173/api/auth/google/calendar/callback` as Google OAuth redirect URIs. Calendar sync also requires the Google Calendar API and `https://www.googleapis.com/auth/calendar.events` scope.
4. Start the API:

   ```sh
   cd Maple-Sugar-BE
   npm install
   npm run dev
   ```

5. In another terminal, start the UI:

   ```sh
   cd Maple-Sugar-FE
   cp .env.example .env.local
   # In .env.local, set VITE_API_MODE=http
   npm install
   npm run dev
   ```

The UI runs at **<http://localhost:5173>**; the API runs at **<http://localhost:3000>**. Vite forwards `/api` requests to the API. An admin must invite an account before its first Google sign-in.

### Full stack with Docker

From the repository root, copy `Maple-Sugar-BE/.env.example` to `Maple-Sugar-BE/.env`. Set the Google OAuth credentials and `JWT_SECRET`, then use:

```dotenv
PUBLIC_API_URL=http://localhost:8080/api
PUBLIC_WEB_URL=http://localhost:8080
```

Register the matching `/auth/google/callback` and `/auth/google/calendar/callback` redirect URIs under `http://localhost:8080/api`, then run:

```sh
docker compose up --build
```

Open **<http://localhost:8080>**. Compose starts PostgreSQL, Redis, the Express API, and the nginx-served frontend. The web image builds with `VITE_API_MODE=http` and `VITE_API_BASE_URL=/api`.

> [!NOTE]
> `VITE_*` values are embedded at build time. Rebuild the web image after changing them. Keep real `.env` files and secrets out of Git.

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

## 🛠️ Common commands

Run these inside the relevant app directory.

| Frontend | Backend |
| --- | --- |
| `npm run dev` — Vite server | `npm run dev` — API with watch mode |
| `npm run build` — production bundle | `npm start` — API without watch mode |
| `npm run lint` — ESLint | `npm run migrate` — apply migrations |
| `npm test` — Vitest | `npm test` — Node tests |
| `npm run preview` — preview bundle | `npm run smoke` — smoke checks |

## 📚 Project map

```text
Maple-Sugar-FE/src/
  pages/       Screens and routes
  components/  Shared UI and charts
  services/    Page-facing API hooks
  data/        HTTP and mock transports
  business/    Domain rules and validation

Maple-Sugar-BE/
  src/routes/        HTTP handlers
  src/services/      Application workflows
  src/repositories/  Database access
  src/business/      Domain rules
  src/auth/          Google OAuth and sessions
  migrations/        Ordered SQL migrations
  docs/              API, schema, and architecture guides
```

For more detail, see the [backend documentation](Maple-Sugar-BE/docs/README.md), [API guide](Maple-Sugar-BE/docs/api.md), and [frontend notes](Maple-Sugar-FE/README.md).

## 🔐 Configuration notes

- Browser requests use `/api/...`; Vite and nginx proxy that prefix to Express routes at `/`.
- Sessions use signed JWT cookies. The browser must send credentials with API requests.
- Allowed sign-in domains default to `g.rit.edu` and `rit.edu`; accounts must also be invited and active.
- Redis improves caching, but the API can use PostgreSQL directly when Redis is unavailable.
- The API health endpoint is `GET /health` on port 3000 locally, or `/api/health` through the frontend proxy.
