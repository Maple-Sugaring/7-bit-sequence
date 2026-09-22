# HTTP API

Paths below are what Express sees. From a browser behind nginx, prefix them with `/api`.

Session is the `maple_session` JWT cookie. Send cookies (`credentials: 'include'`). A bearer token in `Authorization` is also accepted. Responses are JSON. Errors are:

```json
{ "message": "…", "code": "VALIDATION", "details": { "Field": "…" } }
```

| HTTP | `code` | When |
| --- | --- | --- |
| 401 | `BAD_CREDENTIALS` | No session, or Google rejected the code. |
| 403 | `FORBIDDEN` | Role cannot do that. |
| 403 | `NOT_PROVISIONED` | Google account has no invite. |
| 403 | `ACCOUNT_EXPIRED` | Inactive or past `account_expiry`. |
| 403 | `EMAIL_UNVERIFIED` | Google email is not verified. |
| 404 | `NOT_FOUND` | |
| 409 | `CALENDAR_REQUIRED` | Shift time needs a Calendar connection. |
| 422 | `VALIDATION` | Zod or a domain rule. `details` is keyed by field. |
| 502 | `OAUTH_FAILED`, `WEATHER_FAILED` | Google or OpenWeather failed. |
| 503 | | `/health` when Postgres is down. |

Zod runs in `routes/schemas.js` before a handler uses the body.

## Roles

| Role | Can |
| --- | --- |
| Admin | Every capability, including users and shift assignment. |
| Student | Dashboard, Sugar Woods, export, record, alerts, schedule, claim shifts, flag a node. |
| MSS | Dashboard, Sugar Woods, export, guides. No recording and no schedule. |

The check is `requireCapability` / `requireAnyCapability` in `middleware/authenticate.js`. The UI hides buttons with the same matrix; the API is the control.

## Auth

| Method | Path | Auth | |
| --- | --- | --- | --- |
| GET | `/auth/google` | Public | Redirects to Google. Identity scopes only. |
| GET | `/auth/google/callback` | Public | Sets the session cookie. If Calendar is not connected, redirects into the Calendar consent step. |
| GET | `/auth/google/calendar` | Session | Incremental Calendar consent (`calendar.events`, `calendar.freebusy`). |
| GET | `/auth/google/calendar/callback` | Session | Stores the refresh token and backfills claimed shifts. |
| DELETE | `/auth/calendar` | Session | Drops the refresh token. |
| GET | `/auth/session` | Public | `null` when signed out, otherwise `{ token, user }`. |
| POST | `/auth/logout` | Public | Clears the cookie. |

There is no password login. An admin must invite the email first. Allowed domains come from `ALLOWED_EMAIL_DOMAINS`.

Redirect URIs must match `PUBLIC_API_URL`:

- `{PUBLIC_API_URL}/auth/google/callback`
- `{PUBLIC_API_URL}/auth/google/calendar/callback`

## Health and reference

| Method | Path | Auth | |
| --- | --- | --- | --- |
| GET | `/health` | Public | `{ status, database, cache, uptimeSeconds }`. |
| GET | `/roles` | Session | |
| GET | `/gateways` | Dashboard or nodes | |
| GET | `/buckets` | Dashboard or data table | |
| GET | `/guides` | Guides | |

## Nodes

| Method | Path | Auth | |
| --- | --- | --- | --- |
| GET | `/nodes` | Dashboard or nodes | All nodes. |
| GET | `/nodes/board` | Dashboard or nodes | The three tracked taps with latest reading and bucket. |
| GET | `/nodes/:id` | Dashboard or nodes | |
| PATCH | `/nodes/:id` | Admin | Name, stand, status, battery, location. |
| POST | `/nodes/:id/flag` | Flag node | `{ type, description }` creates an alert. |
| POST | `/nodes/:id/actions` | Session, then a finer check | `{ Action, Notes }`. |

`Action`:

- `collect` requires record-data. Writes a metric at tare, a journal line, and resolves open Full Bucket and Collection Needed alerts on that node.
- `maintenance` sets `status_code` 3. `online` sets it to 1. Either needs flag-node or admin.

## Metrics

| Method | Path | Auth | |
| --- | --- | --- | --- |
| GET | `/metrics` | Dashboard or data table | Query: `nodeId`, `season`, `from`, `to`. |
| POST | `/metrics` | Record | Manual reading. `Recorded_By` is the session, not the body. |
| PATCH | `/metrics/:id` | Edit (admin) | Cannot change `NodeID`. |

Body fields: `NodeID`, `BucketID`, `Recorded_At`, `Weight`, `Temperature`, `Sugar_Percent`, `Weather_Conditions`, `Ice_Present`.

Liquid buckets reject gross weight above about 10 gallons plus tare slack. Ice may go to about 14 gallons. A full net weight raises a Full Bucket alert. Sustained heat above 40°F raises Spoilage. Weight far below tare raises Tipped.

## Alerts

| Method | Path | Auth | |
| --- | --- | --- | --- |
| GET | `/alerts` | Dashboard or alerts | Query `resolved=true\|false`. |
| PATCH | `/alerts/:id` | Resolve | `{ Is_Resolved }`. |

## Collection

| Method | Path | Auth | |
| --- | --- | --- | --- |
| GET | `/collection-logs` | Dashboard or data table | Query `season`, `from`, `to`. |
| POST | `/collection-logs` | Record | Volume emptied. |
| GET | `/journal` | Record | Own entries. Admins see every entry. |
| POST | `/journal` | Record | `{ Title, Process_Notes, NodeID, BucketID, Collected_At, Weight, Sugar_Percent, Ice_Present }`. |

## Schedule

| Method | Path | Auth | |
| --- | --- | --- | --- |
| GET | `/schedule/slots` | View schedule | Query `from`, `to`. Open tasks with no start are included. |
| POST | `/schedule/slots` | Manage schedule | Assign a student. See body below. |
| PATCH | `/schedule/slots/:id` | Manage | Task, stand, times, capacity, `Is_Complete`. |
| DELETE | `/schedule/slots/:id` | Manage | Removes Calendar events for assignees. |
| GET | `/schedule/availability` | View schedule | Free two-hour windows from Google free/busy. 409 if Calendar is not connected. |
| POST | `/schedule/slots/:id/claim-time` | Claim | `{ Starts_At, Ends_At }`. Suggestions are optional. The window must be in the future, 30 minutes to 6 hours, within three weeks, and not on top of a busy block. |
| POST | `/schedule/slots/:id/signup` | Claim | Body `{ userId }` optional. Students can only sign themselves up. The slot must already have times. |
| POST | `/schedule/slots/:id/withdraw` | Claim | |

`POST /schedule/slots` body:

```json
{
  "Task": "Sap Collection",
  "UserID": 4,
  "BucketIDs": [1, 7],
  "Starts_At": "2026-03-02T14:00:00.000Z",
  "Ends_At": "2026-03-02T16:00:00.000Z",
  "Notes": "Bring a spare lid"
}
```

A full-bucket alert is not required. The student is signed up immediately. Calendar sync runs after the response and does not block it. Overlap with another shift for that student rolls the new slot back.

## Weather

| Method | Path | Auth | |
| --- | --- | --- | --- |
| GET | `/weather/live` | Dashboard | OpenWeather for the campus. One reading; the three buildings share it. Also raises sap-run and harsh-weather alerts. |
| GET | `/weather/daily` | Dashboard | Query `year`, `nodeId`. Historic daily series. |
| GET | `/weather/compare` | Data table | Query `year`. Per-tree points for Sugar Woods. |

Live weather needs `OPENWEATHER_API_KEY`. Without it the route returns `{ Configured: false, Message }`.

Harsh alerts: Extreme Cold (low at or below 0°F), Hard Freeze (day stays at or below 20°F), High Wind (25 mph, critical at 40), Heavy Precipitation (half an inch), Ice Storm (ice, freezing rain, or sleet in the description).

## Users and settings

| Method | Path | Auth | |
| --- | --- | --- | --- |
| GET | `/users` | Admin | |
| POST | `/users/invite` | Admin | `{ email, roleId, firstName, lastName, accountExpiry }`. Duplicate email is 422. |
| PATCH | `/users/:id` | Admin | Role, names, email, `Is_Active`, `Account_Expiry` (ISO time, or null for no end). An admin cannot demote or deactivate themselves. |
| DELETE | `/users/:id` | Admin | Cannot delete yourself. |
| GET | `/settings` | Dashboard | `{ Report_Interval_Seconds, Report_Interval_Minutes }`. |
| PATCH | `/settings` | Admin | `{ Report_Interval_Minutes }` from 1 to 1440. Copied onto every node. |

`accountExpiry` / `Account_Expiry` is a timestamp, not a date. Existing date-only values were stored as 11:59pm Eastern on that day.

## JSON names

Repositories return the names in `repositories/mappers.js`: `UserID`, `Node_Name`, `Starts_At`, `Ice_Present`, and so on. Do not rename them in SQL and forget the mapper; the UI reads these keys.
