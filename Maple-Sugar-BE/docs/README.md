# Maple Sugaring API

Express API for the RIT sugarbush: three taps (Alumni House, Chabad House, Red Barn), sap readings, alerts, shifts, weather, and Google sign-in.

The browser calls `http://<host>:8080/api/...`. nginx strips `/api` before the request reaches Express, so this process mounts routes at the root (`/metrics`, not `/api/metrics`).

## Layers

```
HTTP  routes/          Zod shapes, auth checks, status codes
        |
services/             Use cases that cross repositories (auth, metrics, weather, calendar)
        |
repositories/         SQL. The data access layer. Rows mapped to the JSON contract
        |
business/             Pure rules: roles, seasons, sap flow, validation, alerts
        |
db/  cache/  auth/    Postgres pool, Redis, Google OAuth, JWT cookie
```

A route may call a repository directly when the use case is one query. It calls a service when the work spans validation, several tables, or an outside API.

## Documents

| Doc | What it covers |
| --- | --- |
| [ddl.md](ddl.md) | Current Postgres schema |
| [api.md](api.md) | HTTP API, auth, errors |
| [dal.md](dal.md) | Repositories and the JSON field contract |
| [services.md](services.md) | Service layer |
| [business.md](business.md) | Domain rules shared with the UI |
| [testing.md](testing.md) | Edge cases covered by the API and UI test suites |

## Boot

`src/server.js` loads `.env`, runs `migrations/*.sql` in filename order, promotes `BOOTSTRAP_ADMIN_EMAILS` to Admin, loads historic weather if `weather_days` is empty, then listens. Postgres down fails `/health` with 503. Redis down is logged and the API serves SQL directly.

Containers talk to each other by Compose service name: `db`, `cache`, and `api`. `PUBLIC_API_URL` and `PUBLIC_WEB_URL` are the browser-facing host, used only for Google redirect URIs.
