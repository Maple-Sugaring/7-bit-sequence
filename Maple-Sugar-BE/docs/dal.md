# Data access layer

`src/repositories/` is the only folder that writes SQL. `src/db/pool.js` owns the `pg` pool.

## Pool

`query`, `queryOne`, `queryAll`, and `transaction`. Numeric and int8 columns parse as JavaScript numbers. A query slower than 200ms is logged. Idle client errors are logged and do not crash the process.

`transaction(handler)` begins, commits, and rolls back. Schedule signup and claim-time use it with `SELECT … FOR UPDATE` so two students cannot take the last seat.

Dates that must stay calendar dates (`users.created_at`) are formatted in SQL with `to_char`. Instants (`account_expiry`, `recorded_at`, shift times) go through `mappers.js` `iso()` as ISO 8601.

## Mappers

`mappers.js` turns a row into the JSON contract. Examples:

| Table column | JSON |
| --- | --- |
| `users.id` | `UserID` |
| `users.account_expiry` | `Account_Expiry` |
| `alerts.message` | `Description` |
| `node.status_code` | `Status_Code` |
| `node.latitude` + `longitude` | `Location: { lat, lon }` or null |
| `metrics.ice_present` | `Ice_Present` |
| `schedule_slots` plus assignments | `Assigned_UserIDs`, `Assignees`, `Awaiting_Time`, `Bucket_Labels` |

`Calendar_Connected` is true when `google_refresh_token` is not null. The token itself never leaves the repository except `getGoogleRefreshToken`, which decrypts it for the Calendar service.

## Repositories

| Module | Tables | Responsibility |
| --- | --- | --- |
| `usersRepository` | `users`, `roles` | Invites, Google link, last login, role and expiry updates, encrypted Calendar token, bootstrap admin promotion. |
| `nodesRepository` | `node`, `gateway` | List, board (tracked nodes plus latest metric and bucket), update, tare lookup. |
| `bucketsRepository` | `buckets` | List and find. |
| `metricsRepository` | `metrics` | Filter by node, season (`sap_season`), and time range. Create and update. Recent history for spoilage. |
| `alertsRepository` | `alerts` | List, create, resolve. `hasOpenAlertOfType` treats null `node_id` as bush-wide (`IS NOT DISTINCT FROM`). |
| `collectionLogsRepository` | `collection_logs` | List and insert empties. |
| `journalRepository` | `collection_journal` | List (optional user filter) and insert, joined to author and node name. |
| `scheduleRepository` | `schedule_slots`, `schedule_assignments` | List, create, update, delete, signup, withdraw, claim-time. Assignments aggregate in SQL so the client does not need the user roster. |
| `guidesRepository` | `guides` | Read-only reference. |
| `settingsRepository` | `app_settings`, `node` | Read and set the report interval, then copy it onto every node. |
| `weatherRepository` | `weather_days`, `sap_daily`, `weather_live` | Daily series, per-tree compare for a year, station summary, live snapshots, bulk insert of the historic file. |

Writable columns are allowlists (`WRITABLE_METRIC_COLUMNS`, `WRITABLE_NODE_COLUMNS`, `WRITABLE_USER_COLUMNS`, `WRITABLE_SLOT_COLUMNS`). A client cannot set `google_sub` or move a reading to another tree by posting an extra field.

## Caching

Routes often wrap a repository read in `cache/redisCache.js` `readThrough`. Keys and TTLs live in `cache/cacheKeys.js` and match the frontend cache. Writes call `invalidateNamespaces` with a prefix (`metrics:`, `alerts:`, `schedule:`, `nodes:`).

Redis errors are misses, not failures. Scan invalidation accepts either a string key or an array batch from the client.

## What does not belong here

Sap-flow math, role checks, and “is this bucket full?” stay in `business/`. Google HTTP and OpenWeather stay in `services/`. Repositories return data or throw `ApiError` for missing rows and for signup rules that are only correct while a row lock is held.
