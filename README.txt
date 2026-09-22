Maple Sugaring — Frontend Repository
====================================

7-Bit Sequence (ISTE 501)

This repository is the web application for the RIT Maple Sugaring program.
It monitors sap collection in the field: tree/node health, sap weight,
temperature, and sugar content, plus collection logging, alerts, and
volunteer shift scheduling.

The stack is two apps that run together:

  Maple-Sugar-FE/   React + Vite UI (Material UI, RIT theme)
  Maple-Sugar-BE/   Express API (Postgres, Redis, Google sign-in)

docker-compose.yml at the repo root builds both and serves them behind
nginx on http://localhost:8080.


What the app does
-----------------

Sign-in is Google OAuth. Only invited accounts on allowed RIT domains
(g.rit.edu, rit.edu by default) can log in. There is no password login
when talking to the real API.

After sign-in, pages are gated by role:

  Admin     Full access: users, schedule management, data edits
  Student   Dashboard, recording, table, alerts, claiming shifts
  MSS       Dashboard and data table (export) for outreach review

Pages (browser routes):

  /login              Sign in with Google
  /dashboard          Home — node gauges / sap status
  /schedule           View and claim collection shifts
  /input              Record a sap reading (weight, temp, sugar %)
  /table              Filterable readings table with CSV export
  /notifications      Sensor and field alerts (resolve / reopen)
  /schedule-admin     Open a collection task from a full-bucket alert (Admin)
  /collection         Write up a sap collection (weight, sugar, ice)
  /admin              Invite users, change roles, lock accounts (Admin)

The UI can run against the live Express API or against an in-memory mock
(seeded fixtures) so the interface can be developed with no backend.


Prerequisites
-------------

  Node.js 22 or newer
  npm
  Docker Desktop (only for the full compose stack)

For local API development without Docker you also need:

  PostgreSQL (database maple_sugaring)
  Redis (optional; the API still runs if Redis is down)


Quick start — UI only (mock data)
---------------------------------

Use this when you only need to look at or work on the React app.

  cd Maple-Sugar-FE
  cp .env.example .env.local
  # In .env.local set:
  #   VITE_API_BASE_URL=/api
  #   VITE_API_MODE=mock
  npm install
  npm run dev

Open http://localhost:5173

Mock mode serves fixtures from src/data/transports/mockTransport.js.
No Postgres, Redis, or Google credentials are required.


Quick start — UI + API (local)
------------------------------

1. Database

   Create a Postgres database named maple_sugaring. Redis on
   localhost:6379 is optional.

2. Backend env

   cd Maple-Sugar-BE
   cp .env.example .env

   Edit .env:

     DATABASE_URL          your local Postgres URL
     REDIS_URL             redis://localhost:6379  (or leave unset)
     JWT_SECRET            openssl rand -base64 48
     GOOGLE_CLIENT_ID      Google Cloud OAuth web client
     GOOGLE_CLIENT_SECRET  matching client secret
     PUBLIC_API_URL        http://localhost:5173/api
     PUBLIC_WEB_URL        http://localhost:5173
     ALLOWED_EMAIL_DOMAINS g.rit.edu,rit.edu

   On the Google OAuth client, register these redirect URIs:

     http://localhost:5173/api/auth/google/callback
     http://localhost:5173/api/auth/google/calendar/callback

   Enable the Google Calendar API if you want claimed shifts to sync
   to the volunteer's calendar. Scope:

     https://www.googleapis.com/auth/calendar.events

   An admin must invite a user (by email) before that person can sign
   in. The first Google login links to the invited row.

3. Start the API (migrations run on boot)

   cd Maple-Sugar-BE
   npm install
   npm run dev

   Listens on http://localhost:3000
   Health check: GET http://localhost:3000/health

4. Start the UI against the API

   cd Maple-Sugar-FE
   cp .env.example .env.local
   # VITE_API_BASE_URL=/api
   # VITE_API_MODE=http
   npm install
   npm run dev

   Open http://localhost:5173

   Vite proxies /api to http://127.0.0.1:3000 and strips the /api
   prefix. Express mounts routes at the root (/metrics, /auth, ...),
   not under /api. nginx in Docker does the same rewrite.


Quick start — Docker (production-like)
--------------------------------------

From this frontend/ directory, with Maple-Sugar-BE/.env filled in:

  # Browser URLs. Change the host if you open the app from another machine.
  # Containers talk to each other as db, cache, and api on the Compose network.
  #   PUBLIC_API_URL=http://localhost:8080/api
  #   PUBLIC_WEB_URL=http://localhost:8080
  #   OPENWEATHER_API_KEY=your-key
  #   BOOTSTRAP_ADMIN_EMAILS=you@g.rit.edu
  #
  # Register matching Google redirect URIs:
  #   http://localhost:8080/api/auth/google/callback
  #   http://localhost:8080/api/auth/google/calendar/callback

  docker compose up --build

Then open http://localhost:8080

Compose services:

  db      Postgres 17
  cache   Redis 7
  api     Express (Maple-Sugar-BE)
  web     Vite build served by nginx, /api proxied to the API

Vite inlines VITE_* values at image build time. docker-compose.yml
already sets VITE_API_BASE_URL=/api and VITE_API_MODE=http for the
web image.


Useful commands
---------------

Frontend (Maple-Sugar-FE):

  npm run dev       Vite dev server (port 5173)
  npm run build     Production bundle into dist/
  npm run preview   Serve the production bundle locally
  npm run lint      ESLint

Backend (Maple-Sugar-BE):

  npm run dev       API with --watch (port 3000)
  npm start         API without watch
  npm run migrate   Apply SQL migrations without starting the server
  npm test          Node test runner
  npm run smoke     Smoke script against .env.test
  npm run lint      ESLint


API surface (browser always calls /api/...)
-------------------------------------------

  GET    /health
  GET    /auth/google
  GET    /auth/google/callback
  GET    /auth/google/calendar
  GET    /auth/google/calendar/callback
  GET    /roles
  GET    /gateways
  GET    /buckets
  GET    /guides
  GET    /nodes
  GET    /nodes/:id
  PATCH  /nodes/:id
  POST   /nodes/:id/flag
  GET    /metrics
  POST   /metrics
  PATCH  /metrics/:id
  GET    /alerts
  PATCH  /alerts/:id
  GET    /collection-logs
  POST   /collection-logs
  GET    /users
  POST   /users/invite
  PATCH  /users/:id
  DELETE /users/:id
  GET    /schedule/slots
  POST   /schedule/slots
  PATCH  /schedule/slots/:id
  DELETE /schedule/slots/:id
  POST   /schedule/slots/:id/signup
  POST   /schedule/slots/:id/withdraw

Session is a signed JWT cookie. Send credentials (cookies) with
browser requests; the Vite proxy and nginx both keep the cookie path
working under /api.


Frontend layout (Maple-Sugar-FE/src)
------------------------------------

  pages/          One screen per route
  routes/         React Router, nav items, capability guards
  components/     Layout, charts, shared UI
  services/       Page-facing API wrappers and async hooks
  data/           apiClient, HTTP vs mock transport, repositories
  business/       Roles, validation, sugar/spoilage/yield rules
  context/        Auth session
  theme/          RIT colors and light/dark mode

Switching data sources is VITE_API_MODE only (http | mock).
Repositories never talk to fetch directly.


Backend layout (Maple-Sugar-BE/src)
-----------------------------------

  server.js       Boot, migrations, graceful shutdown
  app.js          Express assembly (routes at ROOT, not /api)
  routes/         HTTP handlers
  services/       Auth, metrics, Google Calendar
  repositories/   SQL
  business/       Shared domain rules
  db/             Pool and migrate
  cache/          Redis read-through
  auth/           JWT and Google OAuth
  migrations/     Ordered SQL (baseline, contract, seed, calendar)


Environment files
-----------------

Do not commit real secrets.

  Maple-Sugar-FE/.env.example   copy to .env.local
  Maple-Sugar-BE/.env.example   copy to .env

Vite only exposes variables that start with VITE_, and they are baked
in at build time. Changing VITE_API_MODE after a Docker build requires
rebuilding the web image.


Notes
-----

- Node 22+ is required (see Maple-Sugar-BE engines and the Dockerfiles).
- Redis outage is degraded, not fatal. Postgres down makes /health 503.
- Accounts expire; an expired or inactive user cannot sign in even if
  their role would otherwise allow it.
- The Maple-Sugar-FE/README.md file is leftover Vite template text.
  This file is the project README.
