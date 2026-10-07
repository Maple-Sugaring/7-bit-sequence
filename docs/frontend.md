# Frontend (`Maple-Sugar-FE`)

React 19, Vite 8, Material UI 9 with an RIT theme, React Router 7, MUI X (charts, data grid, date pickers), `dayjs`, `recharts`, and `esptool-js` for the USB flasher. Tests use Vitest.

## Source layout (`Maple-Sugar-FE/src`)

| Folder | Role |
| --- | --- |
| `pages/` | One component per screen (lazy-loaded in `routes/AppRoutes.jsx`). |
| `routes/` | `AppRoutes.jsx` (route table, legacy redirects), `ProtectedRoute.jsx` (auth + capability guard), `navigation.js` (nav items, landing route). |
| `components/` | Layout (`AppShell`, `TopBar`, `MainNav`, `Footer`), charts (`ChartCard`, `KpiCard`, `SeriesChart`), common (`PageHeader`, `StateBlock`, `MeterBar`, `format.js`), `gauge.jsx`, `schedule/TimePickerDialog.jsx`. |
| `services/` | Page-facing wrappers and hooks (`useNodes`, `useGateways`, `useAction`, `useAsync` in `services/hooks/`). |
| `data/` | `apiClient.js`, `transports/` (`httpTransport`, `mockTransport`), `repositories/`, `cache/queryCache.js` (in-memory TTL cache that mirrors the backend Redis pattern), `fixtures/seed.js`, `offlineQueue.js`. |
| `business/` | Roles and capabilities, validation, aggregation, sugar content, spoilage, shelf life, yield metrics, `liveWeight.js`, `alertSchedule.js`. |
| `context/` | `AuthProvider.jsx` and `auth.js` (session, `can()`). |
| `hardware/` | `heltecFlash.js`, the Web Serial flasher. |
| `theme/` | RIT colors, MUI theme, light/dark `ColorModeProvider`. |

Repositories never call `fetch` directly; they go through `apiClient`, which picks the transport from `VITE_API_MODE`.

## Data modes

| `VITE_API_MODE` | Transport | Use |
| --- | --- | --- |
| `http` | `httpTransport.js`: `fetch` to `VITE_API_BASE_URL` (default `/api`), `credentials: 'include'`, 8 second timeout, optional `Authorization: Bearer`. | Real API. |
| `mock` | `mockTransport.js`: in-memory copy of `fixtures/seed.js`, 180 ms simulated latency. | UI work, demos. Shows mock login buttons. |

Both values are read at build time (`import.meta.env`). The Docker image sets `http` through build args.

## Pages

| Route | Page | Notes |
| --- | --- | --- |
| `/login` (also `/`) | `LoginPage` | Google button; mock buttons in mock mode. Shows `?error=` banner from a failed OAuth. |
| `/auth/callback` | `AuthCallbackPage` | Landing after Google redirect. |
| `/dashboard` | `DashboardPage` ("The Bush") | Live weather and bucket fill for each tree on Deploy; KPI cards (readings, sugar, shelf life, syrup gallons). |
| `/nodes/:nodeId` | `NodePage` | One tree: battery, bucket, 2026 weight chart, field actions (collect, maintenance, flag). |
| `/deploy` | `DeployPage` | Register gateways, add/edit/delete/flash nodes. See [deploy-and-flasher.md](deploy-and-flasher.md). |
| `/table` | `SapDataPage` ("Sugar Woods") | Filterable readings table with export. |
| `/collection` | `CollectionPage` | Log what was pulled from a tree (weight, Brix, ice, notes). Entries made offline queue in `localStorage` (`maple-collection-queue`, `data/offlineQueue.js`) and flush later. |
| `/notifications` | `AlertsPage` | Open and resolved alerts, resolve and reopen. Links an alert to a schedule task. |
| `/schedule` | `SchedulePage` | Claim shifts, connect Google Calendar. See [schedule.md](schedule.md). |
| `/schedule-admin` | redirect | Legacy; now `/schedule` (admins get the manage panel there). |
| `/admin` | `AdminPage` | Invite users, change roles, lock accounts, set expiry. |

## Business rules duplicated from the API

`business/` keeps client copies of numbers the UI needs without a round trip (permissions, sugar bands, bucket capacity, season). Change both sides together. `test/parity.test.js` checks the sap season boundary matches the backend.

`business/liveWeight.js` is hard-coded to the 2026 calendar year and node ids `[1, 2]` (`LIVE_YEAR`, `LIVE_FROM`, `LIVE_TO`, `LIVE_NODE_IDS`). It converts gross pounds to gallons for the live charts. **TODO**: this will need updating for a new season or more nodes.

## Tests (`Maple-Sugar-FE/test`)

`alertSchedule`, `business`, `heltecFlash`, `liveWeight`, `offlineQueue`, `parity`. Run `npm test`. CI also runs lint and `npm run build`.

## Build and serve

`Maple-Sugar-FE/Dockerfile`: Node 22 build stage (`npm ci`, `npm run build` with `VITE_API_BASE_URL` and `VITE_API_MODE` build args), then `nginx:alpine`. `nginx.conf.template` is rendered at container start with `API_UPSTREAM` (default `http://api:3000`). It serves SPA fallback to `index.html`, long-cache for `/assets/`, `no-cache` for `/firmware/` and `/index.html`, and proxies `/api/*` with the prefix stripped. The API host is resolved per request, so the UI still loads (and `/api` returns 502) when the backend is down.

## Housekeeping notes

- `Maple-Sugar-FE/README.md` is mostly leftover Vite template text.
- `Maple-Sugar-FE/.vscode/github-accounts.json` is tracked despite `.vscode` being in `.gitignore` (it was committed before). **TODO**: decide whether to remove it from the repo.
