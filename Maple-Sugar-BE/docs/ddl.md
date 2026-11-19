# Data definition

Migrations in `migrations/` run once, in order, and are recorded in `schema_migrations`. This page is the schema after `008_three_trees.sql`, not a dump of each file.

Identity columns are `integer generated always as identity` unless noted. Timestamps are `timestamptz`.

## People

### `roles`

| Column | Notes |
| --- | --- |
| `id` | 1 Admin, 2 Student, 3 MSS. The API maps these ids in `business/permissions.js`. |
| `role_name` | Unique. `Admin`, `Student`, or `MSS`. |

### `users`

| Column | Notes |
| --- | --- |
| `role_id` | FK `roles`. |
| `first_name`, `last_name` | Required. |
| `full_name` | Generated `first_name || last_name`. |
| `email` | Unique, also unique on `lower(email)`. |
| `google_sub` | Google subject. Unique when set. Bound on first sign-in. |
| `google_refresh_token` | Encrypted Calendar refresh token. |
| `google_calendar_id` | Defaults to `primary` once Calendar is connected. |
| `is_active` | Inactive accounts cannot sign in. |
| `account_expiry` | `timestamptz`. Null means no expiry. Compared to the current instant. |
| `invite_pending` | True until the next successful sign-in. |
| `last_login`, `created_at` | |

Deleting a user sets `metrics.recorded_by_user_id` and `collection_logs.user_id` to null. It does not delete readings.

## Hardware

### `gateway`

`gateway_code` unique, `gateway_name`, `ip_address`, `status`, `last_ping`. `POST /ingest` sets `last_ping` and `status` to Online.

Campus gateways: Alumni House Pi, Chabad House Pi, Red Barn Pi.

### `node`

| Column | Notes |
| --- | --- |
| `gateway_id` | FK `gateway`. |
| `node_code`, `lora_device_id` | Hardware ids. `lora_device_id` unique when set. |
| `node_name`, `stand` | Display name and site: Alumni House, Chabad House, or Red Barn. |
| `status_code` | 0 offline, 1 online, 2 degraded, 3 maintenance. |
| `battery_level` | Percent. |
| `signal_rssi` | dBm. |
| `latitude`, `longitude` | |
| `tracked` | Only three nodes are tracked (`id` 1, 7, 12). The board and Sugar Woods read these. |
| `report_interval_seconds` | 60–86400. Stored for a future ESP32 sync. Default 900. |
| `installed_at`, `last_seen` | |
| `status` | Legacy text from the baseline. The UI uses `status_code`. |

### `buckets`

One bucket record per tree. `node_id`, `barcode_id` unique, `status`, `tare_weight` (lb), `capacity_liters` (37.85, the 10 gallon liquid line), `tree_species`.

Net sap is `metrics.weight - tare_weight`.

## Readings and logs

### `metrics`

A sensor or manual reading.

| Column | Notes |
| --- | --- |
| `node_id`, `bucket_id` | |
| `recorded_by_user_id` | Null when the node reported it. Set for a manual reading. |
| `recorded_at` | |
| `weight` | Gross pounds, including the bucket. |
| `temperature` | °F. Null on a Pi ingest. Air temperature comes from OpenWeather. |
| `sugar_percent` | Brix. |
| `weather_conditions` | Short label. |
| `ice_present` | Frozen sap may weigh more than 10 gallons. |
| `fill_level_percent`, `sap_flow_rate_lph` | Legacy hardware columns. The app computes fill from weight. |
| `corrected_at`, `corrected_by_user_id` | Set by `PATCH /metrics/:id`. A corrected row is never aggregated. |
| `recorded_manually` | Sticky manual-source flag, retained when deleting an author detaches `recorded_by_user_id`. |

Indexed on `(node_id, recorded_at desc)`, `recorded_at`, `sap_season(recorded_at)`, `bucket_id`. The partial index `metrics_retention_eligible_idx` covers the rows the retention job may compact.

### Retention and aggregation (BRU-007, migration 018)

`METRICS_RAW_RETENTION_DAYS` (default 400, so last season stays raw for comparisons) sets the raw window. `0` turns aggregation off. Any other value below 30 is refused at boot. The cutoff is `now − days`, floored to a UTC hour. An eligible row strictly before the cutoff is moved into `metric_aggregates`, and a row at or after the cutoff stays raw.

Eligible means a sensor reading (`recorded_manually = false` and `recorded_by_user_id is null`) that was never corrected (`corrected_at is null`). Manual and corrected readings stay raw forever so their provenance stays visible, including after an author is deleted. The migration marks existing attributed readings as manual; an insert/update trigger preserves that flag. Aggregates are kept indefinitely.

#### `metric_aggregates`

One row per `node_id`, `bucket_id` and UTC hour (`period_start`, `period_seconds = 3600`). The rows are unique on `(node_id, coalesce(bucket_id, 0), period_start, period_seconds)`.

| Column | Notes |
| --- | --- |
| `reading_count`, `first_recorded_at`, `last_recorded_at` | How many raw rows the period holds, and the time span they cover. |
| `<field>_count`, `_sum`, `_min`, `_max` | For `weight`, `temperature`, `sugar_percent` and `sap_flow_rate_lph`. The count is the number of non-null values. The sum is exact `numeric`. The average is `sum / count`, and it is null when the count is 0. |
| `ice_present_count` | Readings flagged icy. |
| `last_run_id`, `created_at`, `updated_at` | Which run last folded readings into this row. |

Sums are stored instead of means. A coarser average is `Σsum / Σcount`, which weights every hour by the readings it holds. `weather_conditions` is not kept, because sensor rows do not set it.

Hours suit this data because America/New_York is offset from UTC by whole hours, and that stays true across DST. A UTC hour therefore never crosses a local day, week, month or sap season, and those rollups come out exact. In a zone with a fractional offset, an hour is counted in the local period that contains its start.

#### `metric_retention_runs`

One row per run: `status` (`running`, `succeeded`, `failed`, `interrupted`), `trigger` (`schedule` or `manual`), `dry_run`, `triggered_by_user_id`, `raw_retention_days`, `cutoff`, `rows_compacted`, `buckets_written`, `started_at`, `finished_at` and `error`.

### `collection_logs`

Empties: `user_id`, `node_id`, `bucket_id`, `volume_collected` (gallons; renamed from liters), `quality_notes`, `collected_at`.

### `collection_journal`

A written account of a round: `title`, `process_notes`, optional `weight_lb`, `sugar_percent`, `ice_present`, `collected_at`. `user_id` is set null if that person is deleted.

### `alerts`

`node_id` nullable (bush-wide weather alerts have no node), `alert_type`, `severity`, `message`, `is_resolved`, `created_at`.

Types the app writes: Full Bucket, Spoilage, Tipped, Collection Needed, Sap Run, Extreme Cold, Hard Freeze, High Wind, Heavy Precipitation, Ice Storm, Spill, Freezing, plus flags from the field.

## Schedule

### `schedule_slots`

| Column | Notes |
| --- | --- |
| `task`, `stand` | Stand may list more than one site. |
| `starts_at`, `ends_at` | Both null until a time is chosen, or both set with `ends_at > starts_at`. |
| `capacity` | |
| `is_complete` | |
| `alert_id` | Optional FK `alerts` `ON DELETE SET NULL`. One open task per alert. |
| `node_id` | Optional. |
| `bucket_ids` | `integer[]` of buckets on the task. |
| `notes` | |

### `schedule_assignments`

`(slot_id, user_id)` primary key. `google_event_id` is the Calendar event created for that signup.

## Weather

### `weather_days`

Daily NOAA station rollup used as the historic series. Unique `(observed_on, station_id, source)`. Temps in °F, precip in inches. The archive’s nearest station is Wilkes-Barre/Scranton; Rochester itself is outside that file.

### `sap_daily`

One modeled row per tracked tree per weather day. Unique `(observed_on, node_id)`. `flow_gal`, `sugar_percent`, `weight_lb`, `ice_present`, `sap_run`, `flow_index`, plus the station temps for that day.

### `weather_live`

Snapshots from OpenWeather used to see whether a sap run strengthened.

## Other

### `guides`

Static how-to rows: `guide_id`, `category`, `title`, `summary`, `steps` jsonb, `sort_order`.

### `app_settings`

Key/value. `report_interval_seconds` is the sugarbush-wide interval copied onto every node when an admin saves it.

### `societies`

Present from the baseline DDL. The API does not read it.

## `sap_season(timestamptz)`

Immutable SQL function. July through December belong to the next calendar year’s season. Indexed. The same rule is `business/season.js` `seasonOf`.
