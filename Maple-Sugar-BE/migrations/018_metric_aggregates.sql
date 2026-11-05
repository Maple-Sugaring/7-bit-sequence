
-- The retention job (services/metricRetention.js) moves eligible raw rows out
-- of `metrics` and into one `metric_aggregates` row per node, bucket and UTC
-- hour. Each aggregate keeps the count, sum, min and max of every numeric
-- field rather than only the mean, so coarser rollups (day, week, season) can
-- recombine hours into a correctly weighted average.

alter table metrics add column if not exists corrected_at timestamp with time zone;
alter table metrics add column if not exists corrected_by_user_id integer
  references users on delete set null;

-- Keep manual provenance after deleting the author (the user FK is SET NULL).
alter table metrics add column if not exists recorded_manually boolean not null default false;
update metrics set recorded_manually = true where recorded_by_user_id is not null;
create or replace function preserve_manual_metric_source() returns trigger
language plpgsql as $$
begin
  new.recorded_manually := new.recorded_manually or new.recorded_by_user_id is not null;
  return new;
end;
$$;
drop trigger if exists metrics_manual_source on metrics;
create trigger metrics_manual_source before insert or update of recorded_by_user_id on metrics
  for each row execute function preserve_manual_metric_source();

create table if not exists metric_retention_runs
(
    id                   integer generated always as identity primary key,
    status               varchar(16) not null default 'running'
        check (status in ('running', 'succeeded', 'failed', 'interrupted')),
    trigger              varchar(16) not null check (trigger in ('schedule', 'manual')),
    dry_run              boolean not null default false,
    triggered_by_user_id integer references users on delete set null,
    raw_retention_days   integer not null,
    period_seconds       integer not null,
    -- Every eligible raw row strictly before this instant is aggregated.
    -- Always on a UTC hour boundary.
    cutoff               timestamp with time zone not null,
    rows_compacted       integer not null default 0,
    buckets_written      integer not null default 0,
    started_at           timestamp with time zone not null default CURRENT_TIMESTAMP,
    finished_at          timestamp with time zone,
    error                text
);

create index if not exists metric_retention_runs_started_idx
  on metric_retention_runs (started_at desc);

create table if not exists metric_aggregates
(
    id                     integer generated always as identity primary key,
    node_id                integer not null references node,
    bucket_id              integer references buckets,
    -- Inclusive start of the period, on a UTC boundary of period_seconds.
    period_start           timestamp with time zone not null,
    period_seconds         integer not null default 3600 check (period_seconds = 3600),
    reading_count          integer not null check (reading_count > 0),
    first_recorded_at      timestamp with time zone not null,
    last_recorded_at       timestamp with time zone not null,

    weight_count           integer not null default 0,
    weight_sum             numeric,
    weight_min             numeric(8, 2),
    weight_max             numeric(8, 2),

    temperature_count      integer not null default 0,
    temperature_sum        numeric,
    temperature_min        numeric(5, 2),
    temperature_max        numeric(5, 2),

    sugar_percent_count    integer not null default 0,
    sugar_percent_sum      numeric,
    sugar_percent_min      numeric(5, 2),
    sugar_percent_max      numeric(5, 2),

    sap_flow_rate_lph_count integer not null default 0,
    sap_flow_rate_lph_sum  numeric,
    sap_flow_rate_lph_min  numeric(6, 2),
    sap_flow_rate_lph_max  numeric(6, 2),

    ice_present_count      integer not null default 0,

    created_at             timestamp with time zone not null default CURRENT_TIMESTAMP,
    updated_at             timestamp with time zone not null default CURRENT_TIMESTAMP,
    -- The run that last folded readings into this row.
    last_run_id            integer references metric_retention_runs on delete set null
);

-- One row per node, bucket and period. A null bucket is its own group, so it
-- is folded to 0 for uniqueness. The retention job upserts against this.
create unique index if not exists metric_aggregates_period_key
  on metric_aggregates (node_id, (coalesce(bucket_id, 0)), period_start, period_seconds);

create index if not exists metric_aggregates_start_idx
  on metric_aggregates (period_start desc);
create index if not exists metric_aggregates_season_idx
  on metric_aggregates (sap_season(period_start));

-- The job's scan for eligible rows: old sensor readings that were never corrected.
create index if not exists metrics_retention_eligible_idx
  on metrics (recorded_at)
  where not recorded_manually and recorded_by_user_id is null and corrected_at is null;
