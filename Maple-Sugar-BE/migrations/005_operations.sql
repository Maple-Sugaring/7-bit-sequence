-- Collection tasks, historic weather, sap journals, and bucket rules.
--
-- Host-agnostic: nothing here names a developer, a laptop path, or a published
-- port. Containers reach Postgres and Redis by the Compose service names.

-- ---------------------------------------------------------------------------
-- Buckets hold 10 gallons of liquid sap. Ice can weigh more than that because
-- frozen sap stacks above the rim; capacity_liters stays the liquid volume.
-- ---------------------------------------------------------------------------

update buckets
   set capacity_liters = 37.85
 where capacity_liters is distinct from 37.85;

alter table metrics add column if not exists ice_present boolean not null default false;

-- Future ESP32 reporting cadence. Stored now; the mesh does not read it yet.
alter table node add column if not exists report_interval_seconds integer not null default 900;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'node_report_interval_check'
  ) then
    alter table node add constraint node_report_interval_check
      check (report_interval_seconds between 60 and 86400);
  end if;
end $$;

create table if not exists app_settings
(
    key        text primary key,
    value      text not null,
    updated_at timestamp with time zone not null default CURRENT_TIMESTAMP
);

insert into app_settings (key, value)
values ('report_interval_seconds', '900')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- A collection task is opened from a full-bucket alert. The volunteer picks
-- the time, so start and end stay null until then.
-- ---------------------------------------------------------------------------

alter table schedule_slots add column if not exists alert_id integer references alerts;
alter table schedule_slots add column if not exists node_id integer references node;

alter table schedule_slots alter column starts_at drop not null;
alter table schedule_slots alter column ends_at drop not null;

alter table schedule_slots drop constraint if exists schedule_slots_span_check;
alter table schedule_slots add constraint schedule_slots_span_check
  check (
    (starts_at is null and ends_at is null)
    or (starts_at is not null and ends_at is not null and ends_at > starts_at)
  );

create unique index if not exists schedule_slots_open_alert_key
  on schedule_slots (alert_id)
  where alert_id is not null and is_complete = false;

-- ---------------------------------------------------------------------------
-- Daily weather from the NOAA archive, and sap figures modeled from it.
-- ---------------------------------------------------------------------------

create table if not exists weather_days
(
    id            integer generated always as identity primary key,
    observed_on   date           not null,
    station_id    varchar(32)    not null,
    station_name  varchar(200)   not null,
    latitude      numeric(9, 6)  not null,
    longitude     numeric(9, 6)  not null,
    temp_min_f    numeric(5, 1)  not null,
    temp_max_f    numeric(5, 1)  not null,
    precip_in     numeric(6, 3)  not null default 0,
    conditions    varchar(50)    not null,
    source        varchar(32)    not null default 'noaa-isd',
    unique (observed_on, station_id, source)
);

create table if not exists sap_daily
(
    id             integer generated always as identity primary key,
    observed_on    date          not null,
    node_id        integer       not null references node,
    temp_min_f     numeric(5, 1) not null,
    temp_max_f     numeric(5, 1) not null,
    precip_in      numeric(6, 3) not null default 0,
    conditions     varchar(50)   not null,
    flow_gal       numeric(6, 2) not null,
    sugar_percent  numeric(5, 2),
    weight_lb      numeric(8, 2) not null,
    ice_present    boolean       not null default false,
    sap_run        boolean       not null default false,
    flow_index     numeric(4, 3) not null,
    unique (observed_on, node_id)
);

create index if not exists sap_daily_observed_idx on sap_daily (observed_on);

create table if not exists weather_live
(
    id            integer generated always as identity primary key,
    observed_at   timestamp with time zone not null default CURRENT_TIMESTAMP,
    temp_f        numeric(5, 1),
    temp_min_f    numeric(5, 1),
    temp_max_f    numeric(5, 1),
    conditions    varchar(80),
    precip_in     numeric(6, 3),
    flow_index    numeric(4, 3),
    sap_run       boolean,
    summary       text
);

-- ---------------------------------------------------------------------------
-- A volunteer's own write-up of a collection, separate from sensor metrics.
-- ---------------------------------------------------------------------------

create table if not exists collection_journal
(
    id              integer generated always as identity primary key,
    user_id         integer references users on delete set null,
    node_id         integer references node,
    bucket_id       integer references buckets,
    collected_at    timestamp with time zone not null default CURRENT_TIMESTAMP,
    title           varchar(200) not null,
    process_notes   text         not null,
    weight_lb       numeric(8, 2),
    sugar_percent   numeric(5, 2),
    ice_present     boolean      not null default false,
    created_at      timestamp with time zone not null default CURRENT_TIMESTAMP
);

create index if not exists collection_journal_user_idx
  on collection_journal (user_id, collected_at desc);

-- Collection tasks are opened from a full-bucket alert. Drop shifts that were
-- generated without one so the schedule matches that rule.
delete from schedule_slots where alert_id is null;
