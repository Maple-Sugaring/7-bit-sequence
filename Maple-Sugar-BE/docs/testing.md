# Testing

The suite checks domain rules, authorization, and the nginx edge. It does not need Postgres, Redis, or a live Google account. HTTP tests stand up the Express app with the database calls replaced, and the load tests stand up their own replicas.

```
cd Maple-Sugar-BE && npm test
cd Maple-Sugar-FE && npm test
```

Backend tests use Node's built-in runner (`Maple-Sugar-BE/test`). Frontend tests use Vitest (`Maple-Sugar-FE/test`). `test/env.js` forces a fake database URL and JWT secret before `config.js` loads, so a developer's `.env` cannot point the suite at a live database.

## Sap season

A season is named for the year it runs in. July and later belong to the next season. The boundary is UTC on the API and local-noon-safe on the client. `Maple-Sugar-FE/test/parity.test.js` checks that both sides agree at noon UTC.

| Input | Result |
| --- | --- |
| `2026-06-30T23:00:00Z` | Season 2026 |
| `2026-07-01T00:00:00Z` | Season 2027 |
| `not-a-date` | `null`, rather than a guessed year |
| `2026-03-15` / `2026-10-15` (client) | Spring / fall semester |

## Manual readings

`validateReading` on the API is what actually rejects a write. The client copy adds warnings and requires a timestamp. Shared rejection messages are compared in the parity test so the form and the 422 stay in sync.

| Case | API | Client |
| --- | --- | --- |
| Tree, weight 40 lb, sugar 2.2%, 36°F, a past timestamp | Accepted | Accepted when `Recorded_At` is present |
| Temperature only, no tree | `NodeID` and `Sugar_Percent` errors | Also requires `Recorded_At` |
| Sugar 40% | Rejected. Raw sap is 0.5% to 12% | Same message |
| Sugar 8% | Accepted. Unusual but real | Accepted, with a typical-band warning |
| Sugar 0.2% | — | Classified implausible |
| Sugar `"nope"` or weight `"heavy"` | Must be a number | Same message for sugar |
| Weight −1 or −4 | Cannot be negative | Same message |
| Liquid weight above the 10 gal line plus 8 lb | Rejected. Tag ice if it is frozen | — |
| Ice tagged and weight 200 lb | Rejected. Even ice has a ceiling | — |
| Temperature −40°F or 120°F | Must be between −30°F and 90°F | Same message |
| Timestamp 10 minutes ahead | Rejected as future | — |
| Timestamp 20 seconds ahead | Allowed. Covers a fast client clock | — |
| Collection log with no tree, no bucket, or volume 0 | Each field is named. Volume must be greater than zero | — |

Invite, login, and shift forms on the client name the bad field: a non-email, a missing role, a missing password, a shift that ends before it starts, and a capacity below 1.

## Spoilage, buckets, and yield

A warm afternoon is normal. An alert waits until the heat has lasted.

| Case | Result |
| --- | --- |
| One reading at 55°F | 0 hours exposed. No spoilage alert |
| 50°F, then 48°F six hours earlier, then 30°F | 6 hours. The cold reading stops the walk, so the overnight freeze is not charged |
| Newest reading at exactly 40°F after a warmer one | Exposure resets to 0 |
| 48°F held for 6 hours | Critical `Spoilage` alert, and the description names the tree |
| 30°F / 36°F / missing temperature (client) | Safe / watch / safe |
| One 50°F sample (client) | Elevated, not yet critical |
| Six hours above 40°F (client) | Critical, "Collect or discard" |
| Net weight at the 10 gal line minus 4 lb | `Full Bucket` warning |
| Same weight with ice tagged | The description says ice can sit above the liquid line |
| Gross weight under half the tare (0.4 lb on a 2 lb bucket) | Critical `Tipped` |
| Gross 12 lb, tare 2 lb | Net 10 lb |
| Gross below tare | Net is clamped to 0, but the tipover check still fires |
| Half a bucket | Fill percent is 50 |
| Sugar 2% | 43 gallons of sap per gallon of syrup. Not finished. Water-removal fraction is `1 - 2/66.9` |
| Sugar 0 or missing | Ratio is null. Transmittance with no value has no USDA grade |
| Transmittance 80% / 10% | Golden / Very Dark |
| Sugar 66.9% / 2.2% | Finished / typical |
| Weight rises 6 lb in 3 hours | 2 lb/hour |
| Weight drops between readings | Flow is 0. The bucket was emptied, not flowing backwards |
| Collection volumes `1.5`, `null`, and a blank row | Total 1.5. Blanks are not treated as numbers |
| Held at 32°F / 42°F | 96 hours / 48 hours of shelf life |
| 42°F and sugar above 3% | Window is shorter than 48 hours |
| 0 hours / unknown / 6 hours left / 30 hours left | "Expired" / "Unknown" / error / success |

## Sap flow and collection windows

A run needs a night below 32°F and a day back above it.

| Weather | Result |
| --- | --- |
| Low 20°F, high 45°F, no rain | A run. About 1.5 gal and 2.3% sugar. Not ice |
| Low 40°F, high 50°F | No run. Flow 0, sugar null |
| High 60°F after a freeze | Flow cut to about 1.18 gal |
| 0.3 in of rain on a 45°F thaw | More volume (about 1.68 gal) and thinner sugar (about 2.05%) |
| Today is a run and yesterday was not | Flow change `up` |
| Today is not a run and yesterday was | Flow change `down`, summary says there is no run |
| 10 gallons | 86 lb, using 8.6 lb per gallon |
| Historic day at 20°F / 45°F for one tree | Modeled weight stays at or above the bucket tare, and flow stays under 2.6 gal |

Windows are built in `America/New_York`, including the daylight-saving shift.

| Case | Result |
| --- | --- |
| Noon on 15 Jan 2026 | `17:00Z` (EST, UTC−5) |
| Noon on 15 Jul 2026 | `16:00Z` (EDT, UTC−4) |
| Block already ended, or starting within 30 minutes | Left off the suggestion list |
| Block overlapping a busy range | Left off the list |
| Chosen shift of 10 minutes | Rejected. Minimum is 30 minutes, maximum is 6 hours |
| Start already in the past | Rejected |
| Overlap with a calendar event (`Start` / `End` or `start` / `end`) | Rejected |
| A two-hour window tomorrow with nothing busy | Accepted |
| Unknown stand name | Temperature offset 0. Known stands are Alumni House, Chabad House, and Red Barn (Red Barn is −0.8°F) |

## Roles and the screens they see

Role ids are 1 Admin, 2 Student, 3 MSS. Any other id is no role and has no capabilities. The client and the API are checked against each other for every role and every capability.

| Who | Allowed | Refused |
| --- | --- | --- |
| Admin | Every capability, including managing the schedule | — |
| Student | Record data, claim a shift, resolve alerts, open the schedule | Edit a stored reading, manage users, manage the schedule, open `/admin` |
| MSS | Dashboard ("The Bush") and the data table ("Sugar Woods"), including export | Record data, view alerts, view or manage the schedule, collection, admin |
| No session | — | 401 `BAD_CREDENTIALS`, not 403. Hiding a button is not the control |

`requireSelfOrCapability` lets a student act on their own id and rejects someone else's. An admin can act on another id.

Account state is separate from the role:

| Account | Usable |
| --- | --- |
| Missing user | No |
| `Is_Active` false | No. The client labels this "Locked" |
| Expiry in the past | No, even if the role would otherwise allow the action |
| Active, expiry null | Yes |
| Active, expiry still ahead | Yes |
| Ten days until expiry | Warning |

Over HTTP, with a real session cookie or bearer token and a stand-in for the users table:

| Request | Result |
| --- | --- |
| Student `GET /users` | 403, before the handler runs |
| MSS `GET /schedule/slots` | 403 |
| MSS `POST /metrics` | 403 |
| Student `PATCH /metrics/4` | 403 |
| `GET /users` with no token | 401 |
| Admin changes their own role, or deletes their own account | 403 |
| Expired token, inactive account, or a string that is not a JWT | `GET /auth/session` is 200 with `null`. The token is not trusted by itself |
| Garbage `maple_session` cookie plus a valid bearer token | 401. The cookie wins, so a bad cookie is not rescued |

## Rows leaving the database

Mappers rename columns to the names the UI reads, and they do not pass secrets through.

| Stored value | Sent to the client |
| --- | --- |
| Null first and last name | Empty strings |
| `created_at` of `2026-01-15` | That date, not a timezone-shifted instant |
| `last_login` as a `Date` | ISO 8601 |
| `calendar_connected` of `0` | `false` |
| A refresh token column | Not a field on the user object |
| Gateway status `active` | Online |
| `degraded`, or null | Offline. An unknown gateway is not treated as live |
| Latitude and longitude both present, including numeric strings | `{ lat, lon }` |
| Either coordinate missing | `Location: null`, which is different from a pin at 0,0 |
| Weight `"12.50"`, sugar `"2.10"`, temperature null, `ice_present` 0 | Numbers 12.5 and 2.1, temperature null, ice false |
| Alert column `message` | `Description` |

Cache keys and TTLs are the same strings on both sides. An empty filter is dropped, so `{ season: 2026, nodeId: '', from: undefined }` hashes to `season=2026`. A Redis miss still calls the loader and returns its value.

## Sign-in, cookies, and secrets

There is no password login. `POST /auth/login` is 404, and the password in the body is not echoed.

| Case | Result |
| --- | --- |
| Signed session token | `sub`, email, and role come back, issuer `maple-sugar-api` |
| Missing token, garbage, wrong secret, wrong issuer, or an expired token | Rejected |
| Token with `alg: none` and an empty signature | Rejected. The algorithm list is pinned to HS256 |
| Session and OAuth-state cookies | `HttpOnly`, `SameSite=Lax`, `Path=/` |
| `PUBLIC_WEB_URL` is `http://` (the Compose stack) | `Secure` is off. A secure cookie would be dropped on `http://localhost:8080` |
| Session lifetime | 7 days. The state cookie lasts 10 minutes |
| `GET /auth/session` with no cookie | 200 and `null` |
| Logout | 204 and a `HttpOnly` `maple_session` clear |
| Session JSON | No `refresh` and no `password` fields |
| `GET /auth/google` | 302 to Google, `prompt=select_account`, state cookie is `HttpOnly`, client secret is not in the URL |
| Calendar consent URL | Carries the state, `prompt=consent`, and the calendar events scope. Still no client secret |
| Callback `code` with a forged `state` | Redirect to `/login?error=...` and no `maple_session` cookie |
| Two `createState()` calls | Different values, each longer than 20 characters |
| State compared to itself | Match |
| State with an extra character, a different length, missing, or empty | No match. Length is checked before the timing-safe compare |
| `ada@rit.edu` and `ada@G.RIT.edu` | Allowed |
| `gmail.com`, `student.rit.edu`, or a string with no `@` | Refused. The allowlist is the domain, not a suffix |

Refresh tokens are AES-256-GCM, packed as `iv.tag.ciphertext`.

| Case | Result |
| --- | --- |
| `"refresh-token-ñ"` | Round-trips. The packed form is not the plaintext |
| Empty string, `null`, or `"not-a-payload"` | `null` |
| First byte of the authentication tag flipped | Decrypt throws. Flipping only the last base64url character is not a reliable tamper, because that character can decode to the same tag |

## Request shape and error bodies

Every failure the client sees is `{ message, code, details }`.

| Case | Result |
| --- | --- |
| `DELETE /nope` | 404 `NOT_FOUND`. The message names the method and path. No stack |
| An internal `Error` whose message contains a password | 500 `INTERNAL`, "Something went wrong on our end." The password and the stack are absent |
| `ApiError` 401 | Status and `BAD_CREDENTIALS` pass through |
| Zod failure on an empty task and a bad start time | 422 `VALIDATION`, with `details.Task` and `details.Starts_At` |
| Postgres `23505` unique violation | 422, "That record already exists." |
| A thrown database error mentioning `secret_internal` | 500 `INTERNAL`. The relation name is not in the body |
| A raw `Error` with `ECONNREFUSED 10.1.2.3:5432` on the client | "Something went wrong. Please try again." |
| Client `ApiError` with code `NETWORK` | Says the server cannot be reached |
| Client 401 / 403 / 422 | Sign-in message, `isForbidden`, `isValidation` |
| `GET /health` while the database answers | 200, `database: true`, cache not connected. No `X-Powered-By`. `X-Content-Type-Options: nosniff` |
| Database query throws | 503, `status: unhealthy` |
| `Origin` is the configured web URL | That origin is reflected, and credentials are allowed |
| `Origin: https://evil.example` | The foreign origin is not reflected. Session body is still `null` |
| JSON body of about 300 KB, or truncated `{` | 4xx or 500. The body is not echoed, and a stack frame (`at ` / `node_modules`) is not included |
| Sugar 50% on `POST /metrics` as a student | 422, field message naming 0.5% and 12% |
| `GET /nodes/0` | 422. No `from node` query runs |
| Path id `4` | Accepted |
| Path id `0`, `-3`, or `1;drop` | Rejected before it is a number the query can use |
| Shift ending before it starts, or `BucketIDs: []` | Rejected |
| Invite `not-an-email`, or role id 9 | Rejected |
| Invite `  Ada@rit.edu  ` with role 2 | Accepted after trim |
| Report interval 0 or 1441 minutes | Rejected. 15 is accepted |
| Invite `firstName` of `x'; drop table users;--` | 201. The text is a bound parameter. The SQL text does not contain `drop table` |
| 40 parallel `/health` and `/auth/session` calls | All 200 |

Percent change from 10 to 15 is 50. A zero or missing baseline is `null`, not an infinity. Missing display values render as `—`. Zero minutes ago is "just now". Ninety minutes is "2 hr ago". A positive change is prefixed with `+`.

## Load balancing and the nginx edge

Compose publishes one API. The load test runs three replicas behind a small proxy that follows the same rules nginx would use if `API_UPSTREAM` were a pool: round-robin, skip a replica whose `/health` is down, strip `/api`, and add the security headers on the way out.

| Case | Result |
| --- | --- |
| 90 requests to `/api/metrics?season=2026` across 3 healthy replicas | 30 each |
| Path the replica sees | `/metrics?season=2026`, not `/api/...` |
| `X-Forwarded-For` | Contains `127.0.0.1` |
| Response headers | `nosniff`, `SAMEORIGIN`, `strict-origin-when-cross-origin` |
| Middle replica returns 503 from `/health` | It receives no traffic. The other two share the 30 requests |
| Every replica unhealthy | 502. The proxy does not pick a dead upstream |

The nginx template and `docker-compose.yml` are checked as files, not by booting Docker:

| Contract | What is required |
| --- | --- |
| `/api/(.*)` | Proxied to `$api_upstream/$1`, so the prefix is stripped |
| Upstream | A variable plus `NGINX_LOCAL_RESOLVERS`, so nginx looks the API up per request instead of refusing to boot when it is down |
| Forwarded headers | `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` |
| Deep links | `try_files` falls through to `index.html` |
| `/assets/` | `Cache-Control` is immutable for a year, and the security-header include is repeated. nginx drops inherited `add_header` lines in any block that sets its own |
| `/index.html` | `no-cache`, and the security headers are included again |
| `security-headers.conf` | `nosniff`, `SAMEORIGIN`, `strict-origin-when-cross-origin` |
| Compose | The API is `expose`d on 3000 and has no published `ports`. Only the web container publishes `8080:80`. Web waits until the API `/health` check is healthy |
