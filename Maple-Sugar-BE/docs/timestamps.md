# Timestamps and activity tracing (FR-036)

Every instant is stored as `timestamptz` (UTC) and returned as ISO 8601 with `Z`. Each name means one thing only. The rules live in `src/business/activity.js`.

## What each timestamp means

| Name | Column | Meaning | Set by |
| --- | --- | --- | --- |
| `Recorded_At` | `metrics.recorded_at` | **Measurement.** When the node, or the person entering a reading, measured. | The client. A blank manual reading uses the receipt time. |
| `Received_At` | `metrics.received_at`, `activity_events.received_at` | **Request receipt.** When this API first received the request that carried the data. | `requestContext` middleware, the first thing each request passes through. |
| `Created_At` | `metrics.created_at` | **Write.** When Postgres stored the row (`clock_timestamp()`). | Database default. |
| `Corrected_At` | `metrics.corrected_at` | **Update.** When a person last corrected the row. | `PATCH /metrics/:id`. |
| `Occurred_At` | `activity_events.occurred_at` | **Activity.** When a read, write, ingest batch or background job happened. | Database default. |
| `Compacted_At` | `metric_aggregates.updated_at` | **Scheduled operation.** When the retention job folded raw rows into an hourly aggregate. | Retention job. |

These stay separate on purpose:

- **Delayed ingestion.** A node that was offline for a day still reports its own `Recorded_At`. `Received_At` says when the API got it, and the trace shows the gap as `Ingest_Delay_Seconds`.
- **Buffered batches.** When Postgres is down, `POST /ingest` buffers the batch to disk with its `receivedAt` and `requestId`. The replay stores those originals. `Created_At` shows the later write.
- **Retries.** The same node and `Recorded_At` posted again is a duplicate. The stored row keeps its first `Received_At`, and the retry is logged as `metric.duplicate` with both receipt times.
- **Future check.** Ingest rejects a reading more than 60 seconds after its receipt time. It is not compared with the replay time, so a replay cannot let a future-dated reading through.
- Readings from before migration 026 have null `Received_At` and `Created_At`. Those are left null instead of guessed.

## UTC and time zones

- Client timestamps (`Recorded_At` on `POST /ingest`, `POST /metrics` and `PATCH /metrics/:id`) **must include an offset**, either `Z` or `±hh:mm`. Otherwise the request fails with 422. A bare `2026-03-08T02:30` could be read differently by JavaScript and by Postgres, and around DST it may name a time that does not exist or one that happens twice. The gateway and the web app already send `toISOString()`.
- Any offset is accepted and stored as the same UTC instant. `2026-03-08T03:00:00-04:00` and `2026-03-08T07:00:00Z` are one reading.
- Storage does not depend on the Postgres session time zone. `test/integration/timestamps.pg.test.js` checks this with the session set to `America/New_York`.
- Local-calendar grouping (`GET /metrics/rollup?timeZone=`) is done when the data is read. It is never applied when the data is stored.

## Request correlation

Each request gets an id. An `X-Request-Id` header of 8–64 characters from `[A-Za-z0-9._:-]` is kept. Any other value is replaced with a UUID. The id appears in:

- the `X-Request-Id` response header (exposed to the browser through CORS)
- the request's pino log line (`req.id`)
- `metrics.request_id` on any reading the request wrote
- `activity_events.request_id` on every event the request caused, including the later replay of a buffered batch

## Activity events

`activity_events` holds one row per instrumented operation:

| Kind | Operation | Entity | When |
| --- | --- | --- | --- |
| `ingest` | `ingest.batch` | gateway | Every `POST /ingest` batch, including buffer replays (`detail.source = buffer_replay`). Outcome is `ok`, `partial` or `rejected`. |
| `ingest` | `ingest.buffered` | — | A batch was spooled because Postgres was down. Usually lost with the outage. The log line keeps the id. |
| `write` | `metric.create` | metric | A sensor, manual, collection or dashboard-collect reading was stored. |
| `write` | `metric.duplicate` | metric | A retry matched an existing reading. |
| `write` | `metric.correct` | metric | `PATCH /metrics/:id`. Commits with the correction. |
| `write` | `alert.derive` | alert | An alert raised automatically from a reading (`detail.metric_id`). |
| `read` | `metrics.list`, `metrics.rollup` | node, when filtered | `GET /metrics`, `GET /metrics/rollup`. A list read records which nodes and which `Recorded_At` range it returned. |
| `read` | `activity.list`, `metric.trace` | metric for a trace | An admin opened the trace view. |
| `job` | `retention.run` | — | Scheduled or manual compaction (`detail.run_id`). |
| `job` | `ingest.buffer_replay` | — | A replay that moved or kept at least one batch. Ticks with nothing to replay are not recorded. |
| `job` | `activity.prune` | — | Activity retention. |

Except for the correction, recording never fails the operation it describes. A failed insert is logged and the request goes on.

### What is not stored

`detail` passes through `activityDetail()`. It keeps ids, counts, filters, outcomes and times. Any key that looks like a credential, session, contact detail, note, reason, body or payload is dropped. Strings are capped at 200 characters and arrays at 50 items, and nesting stops at two levels. Reading values (weight, sugar, temperature) are never copied. Correction values and reasons stay in the append-only `audit_events`.

### Retention and access

- `ACTIVITY_RETENTION_DAYS` (default 90; `0` keeps everything; otherwise at least 7). Housekeeping prunes at boot and every 12 hours. Each prune records an `activity.prune` event.
- `audit_events` is the audit trail. It is append-only and never pruned.
- Only admins (`manage_users`, the same gate as `/audit-events`) can read activity. Opening the trace view is itself recorded.

## Admin trace view

The Admin page has an **Activity trace** panel under the audit history. The API behind it:

| Method | Path | |
| --- | --- | --- |
| GET | `/activity-events` | Newest first. Query: `kind`, `operation`, `entityType`, `entityId`, `nodeId`, `requestId`, `actorUserId`, `from`, `to`, `before` (id cursor), `limit` (1–200, default 50). Returns `{ items, next }`. |
| GET | `/activity-events/policy` | Retention, access, and the timestamp meanings above. |
| GET | `/activity-events/metrics/:id` | One reading's full trace. |

The trace for a reading returns:

- `Reading`: `Recorded_At`, `Received_At`, `Created_At`, `Corrected_At`, `Ingest_Delay_Seconds`, `Request_ID`, `Source` and `Status`. `Status` is `stored`, `compacted` or `deleted`.
- `Compaction`: when the retention job folded the reading into an aggregate, the aggregate period and the `Run_ID`.
- `Activity`: the create event, the ingest batch and any replay, retries, derived alerts, corrections, the retention run, and every `metrics.list` read that returned this reading. A read matches when its node list contains the reading's node, its `Recorded_At` range covers the reading, and it happened after the write.
- `Audit`: the `measurement_overwritten` audit entries.

Limits: a read's node list is capped at 50 nodes, and a read whose result spanned more nodes may not match. Rollup reads are recorded per node and are not matched to single readings.

## Tests

- `test/business/timestamps.test.js` covers offset parsing, UTC normalisation across the 2026 DST changes, delay arithmetic, the future check against receipt time, detail scrubbing, read summaries, the retention cutoff and request ids.
- `test/integration/timestamps.pg.test.js` needs `MAPLE_TEST_DATABASE_URL`. It runs the whole workflow (offline node, late post, read, trace) and covers buffered replay, retries, rejected batches, the session time zone, manual entries, corrections, compaction tracing, pruning and paging.
