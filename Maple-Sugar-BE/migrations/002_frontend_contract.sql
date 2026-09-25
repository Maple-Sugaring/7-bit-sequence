-- Adds everything the React frontend reads but the baseline DDL does not model.
--
-- Nothing here is speculative: each column below backs a field the UI already
-- renders or a business rule it already computes. The baseline's own columns
-- are left in place even where the API does not serve them, so the hardware
-- ingest path is unaffected.

-- ---------------------------------------------------------------------------
-- users: name split, account lifecycle, and the Google OAuth identity
-- ---------------------------------------------------------------------------

-- The UI shows first and last name separately (and sorts the roster by last
-- name), so the single full_name column is split. full_name is then restored
-- as a generated column, keeping any existing team queries against it working.
alter table users add column if not exists first_name varchar(100);
alter table users add column if not exists last_name varchar(100);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'users' and column_name = 'full_name'
      and is_generated = 'NEVER'
  ) then
    update users
       set first_name = coalesce(nullif(split_part(full_name, ' ', 1), ''), full_name),
           last_name  = btrim(substr(full_name, length(split_part(full_name, ' ', 1)) + 1))
     where first_name is null;

    alter table users drop column full_name;
  end if;
end $$;

alter table users alter column first_name set default '';
alter table users alter column last_name set default '';
update users set first_name = '' where first_name is null;
update users set last_name = '' where last_name is null;
alter table users alter column first_name set not null;
alter table users alter column last_name set not null;

alter table users add column if not exists full_name varchar(201)
  generated always as (btrim(first_name || ' ' || last_name)) stored;

-- Account lifecycle: a student's access is granted for a term and then lapses.
-- An inactive or expired account is refused at sign-in even though its role
-- would otherwise permit access.
alter table users add column if not exists last_login timestamp with time zone;
alter table users add column if not exists is_active boolean not null default true;
alter table users add column if not exists account_expiry date;
alter table users add column if not exists google_calendar_id varchar(255);

-- Set when an admin invites someone who has not yet completed a first sign-in.
alter table users add column if not exists invite_pending boolean not null default false;

-- Google's stable subject claim. Keyed on rather than email because a user can
-- change their email address at the identity provider while remaining the same
-- account, and because it prevents an email collision from granting access.
alter table users add column if not exists google_sub varchar(255);

create unique index if not exists users_google_sub_key on users (google_sub)
  where google_sub is not null;

-- The invite flow rejects duplicates case-insensitively, which the baseline's
-- plain unique constraint on email does not enforce.
create unique index if not exists users_email_lower_key on users (lower(email));

-- Removing a person must not remove the season's data with them. The baseline's
-- default NO ACTION would make deleting anyone who ever recorded a reading fail
-- outright, and cascading would silently destroy sap measurements when a student
-- graduates. Detaching attribution keeps the science and drops the personal link.
alter table metrics
  drop constraint if exists metrics_recorded_by_user_id_fkey,
  add constraint metrics_recorded_by_user_id_fkey
    foreign key (recorded_by_user_id) references users on delete set null;

alter table collection_logs
  drop constraint if exists collection_logs_user_id_fkey,
  add constraint collection_logs_user_id_fkey
    foreign key (user_id) references users on delete set null;

-- ---------------------------------------------------------------------------
-- gateway: display name
-- ---------------------------------------------------------------------------

-- gateway_code stays the hardware identifier; this is what the UI labels.
alter table gateway add column if not exists gateway_name varchar(100);
update gateway set gateway_name = gateway_code where gateway_name is null;

-- ---------------------------------------------------------------------------
-- node: LoRa identity, health telemetry, and physical siting
-- ---------------------------------------------------------------------------

alter table node add column if not exists lora_device_id varchar(64);
alter table node add column if not exists node_name varchar(100);

-- The UI switches on a numeric status rather than the baseline's free-text
-- column, because it drives a four-way chip and a filter.
alter table node add column if not exists status_code smallint not null default 1;
alter table node add column if not exists signal_rssi integer;
alter table node add column if not exists latitude numeric(9, 6);
alter table node add column if not exists longitude numeric(9, 6);

-- Which sugarbush the node sits in. Used to group the dashboard, the device
-- list, and shift assignments.
alter table node add column if not exists stand varchar(50);

-- Distinct from installed_at: drives the staleness warning on the device page.
alter table node add column if not exists last_seen timestamp with time zone;

update node set node_name = node_code where node_name is null;
update node set lora_device_id = node_code where lora_device_id is null;

create unique index if not exists node_lora_device_id_key on node (lora_device_id)
  where lora_device_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'node_status_code_check'
  ) then
    -- 0 Offline, 1 Online, 2 Degraded, 3 Maintenance
    alter table node add constraint node_status_code_check
      check (status_code between 0 and 3);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- buckets: barcode, lifecycle status, and tare weight
-- ---------------------------------------------------------------------------

alter table buckets add column if not exists barcode_id varchar(50);
alter table buckets add column if not exists status varchar(20) default 'At Tree';

-- Load cells report gross weight, so every net-weight, gallon, yield, and
-- full-bucket figure in the app is `weight - tare_weight`. Without this the
-- entire yield side of the dashboard cannot be computed.
alter table buckets add column if not exists tare_weight numeric(6, 2);

update buckets
   set barcode_id = 'BKT-' || lpad(id::text, 3, '0')
 where barcode_id is null;

create unique index if not exists buckets_barcode_id_key on buckets (barcode_id)
  where barcode_id is not null;

-- ---------------------------------------------------------------------------
-- metrics: the sensor readings the business rules actually consume
-- ---------------------------------------------------------------------------

-- fill_level_percent and sap_flow_rate_lph stay for the hardware to populate.
-- These four are what the app reads: spoilage detection thresholds on
-- temperature, the finished-syrup target on sugar_percent, and yield on
-- weight. Units are imperial to match the UI (pounds, Fahrenheit).
alter table metrics add column if not exists weight numeric(8, 2);
alter table metrics add column if not exists temperature numeric(5, 2);
alter table metrics add column if not exists sugar_percent numeric(5, 2);
alter table metrics add column if not exists weather_conditions varchar(50);

-- ---------------------------------------------------------------------------
-- collection_logs: collector's notes, and an honest unit on the volume column
-- ---------------------------------------------------------------------------

alter table collection_logs add column if not exists quality_notes text default '';

-- Renamed because the whole UI is imperial and a _liters suffix on a value
-- rendered as gallons would be actively misleading.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'collection_logs' and column_name = 'volume_collected_liters'
  ) and not exists (
    select 1 from information_schema.columns
    where table_name = 'collection_logs' and column_name = 'volume_collected'
  ) then
    alter table collection_logs rename column volume_collected_liters to volume_collected;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- schedule: absent from the baseline entirely
-- ---------------------------------------------------------------------------

create table if not exists schedule_slots
(
    id          integer generated always as identity primary key,
    task        varchar(100) not null,
    stand       varchar(50)  not null,
    starts_at   timestamp with time zone not null,
    ends_at     timestamp with time zone not null,
    capacity    integer      not null default 2 check (capacity > 0),
    is_complete boolean      not null default false,
    created_at  timestamp with time zone not null default CURRENT_TIMESTAMP,
    constraint schedule_slots_span_check check (ends_at > starts_at)
);

-- A shift holds several students and a student works several shifts, so the
-- UI's Assigned_UserIDs array is a join table rather than a column.
create table if not exists schedule_assignments
(
    slot_id     integer not null references schedule_slots on delete cascade,
    user_id     integer not null references users on delete cascade,
    assigned_at timestamp with time zone not null default CURRENT_TIMESTAMP,
    primary key (slot_id, user_id)
);

-- ---------------------------------------------------------------------------
-- guides: static reference content served to the Guides page
-- ---------------------------------------------------------------------------

create table if not exists guides
(
    guide_id   text primary key,
    category   varchar(50)  not null,
    title      varchar(200) not null,
    summary    text         not null default '',
    steps      jsonb        not null default '[]'::jsonb,
    sort_order integer      not null default 0
);

-- ---------------------------------------------------------------------------
-- Season derivation
-- ---------------------------------------------------------------------------

-- A sap season is named for the calendar year it runs in, so anything from
-- July onward belongs to the next year's season. Fixed to UTC rather than the
-- session time zone, which is what makes it IMMUTABLE and therefore indexable.
create or replace function sap_season(ts timestamp with time zone)
  returns integer
  language sql
  immutable
  parallel safe
as $$
  select case
           when extract(month from ts at time zone 'UTC') >= 7
             then extract(year from ts at time zone 'UTC')::integer + 1
           else extract(year from ts at time zone 'UTC')::integer
         end
$$;

-- ---------------------------------------------------------------------------
-- Indexes for the hot read paths
-- ---------------------------------------------------------------------------

create index if not exists metrics_node_recorded_idx on metrics (node_id, recorded_at desc);
create index if not exists metrics_recorded_idx on metrics (recorded_at desc);
create index if not exists metrics_season_idx on metrics (sap_season(recorded_at));
create index if not exists metrics_bucket_idx on metrics (bucket_id);

-- Partial: the notification badge only ever counts unresolved alerts.
create index if not exists alerts_unresolved_idx on alerts (created_at desc)
  where is_resolved = false;
create index if not exists alerts_node_idx on alerts (node_id);

create index if not exists collection_logs_collected_idx on collection_logs (collected_at desc);
create index if not exists collection_logs_season_idx on collection_logs (sap_season(collected_at));

create index if not exists schedule_slots_starts_idx on schedule_slots (starts_at);
create index if not exists schedule_assignments_user_idx on schedule_assignments (user_id);

create index if not exists buckets_node_idx on buckets (node_id);
create index if not exists node_gateway_idx on node (gateway_id);
create index if not exists node_stand_idx on node (stand);
