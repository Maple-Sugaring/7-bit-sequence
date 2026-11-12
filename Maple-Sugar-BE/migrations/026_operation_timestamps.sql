-- FR-036: timestamps for request receipt, database write, and an activity log
-- of reads, writes, ingest batches and background jobs.
--
-- recorded_at stays the moment the node measured. These columns say when the API
-- first received the sample and when Postgres stored the row, so a reading
-- buffered offline for a day keeps its measurement time and still shows the
-- delay. Rows from before this migration have no receipt or write time and
-- keep null rather than a guess.

alter table metrics
  add column received_at timestamptz,
  add column created_at timestamptz,
  add column request_id text;

alter table metrics alter column created_at set default clock_timestamp();

-- One row per instrumented operation. Payloads are never stored: `detail`
-- holds ids, counts, filters and timestamps only (src/business/activity.js).
-- Unlike audit_events this is operational data and is pruned after
-- ACTIVITY_RETENTION_DAYS.
create table activity_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  received_at timestamptz,
  request_id text,
  kind text not null check (kind in ('read', 'write', 'ingest', 'job')),
  operation text not null,
  outcome text not null default 'ok' check (outcome in ('ok', 'partial', 'rejected', 'failed', 'skipped')),
  actor_user_id integer,
  gateway_id integer,
  entity_type text,
  entity_id bigint,
  node_id integer,
  row_count integer,
  duration_ms integer,
  data_mode text not null default active_data_mode(),
  detail jsonb not null default '{}'::jsonb
);

create index activity_events_occurred_idx on activity_events (occurred_at desc, id desc);
create index activity_events_entity_idx on activity_events (entity_type, entity_id, occurred_at desc);
create index activity_events_node_idx on activity_events (node_id, occurred_at desc) where node_id is not null;
create index activity_events_request_idx on activity_events (request_id) where request_id is not null;
