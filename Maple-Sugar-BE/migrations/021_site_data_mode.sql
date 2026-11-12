create table site_data_mode (
  singleton boolean primary key default true check (singleton),
  mode text not null check (mode in ('test', 'production'))
);
insert into site_data_mode (mode) values ('test');

create function active_data_mode() returns text language sql stable as $$
  select mode from site_data_mode where singleton;
$$;

create function lock_data_mode() returns text language sql volatile as $$
  select mode from site_data_mode where singleton for share;
$$;

alter table metrics add column data_mode text not null default 'test' check (data_mode in ('test', 'production'));
alter table collection_logs add column data_mode text not null default 'test' check (data_mode in ('test', 'production'));
alter table collection_journal add column data_mode text not null default 'test' check (data_mode in ('test', 'production'));
alter table metric_aggregates add column data_mode text not null default 'test' check (data_mode in ('test', 'production'));

alter table metrics alter column data_mode set default lock_data_mode();
alter table collection_logs alter column data_mode set default lock_data_mode();
alter table collection_journal alter column data_mode set default lock_data_mode();

drop index metric_aggregates_period_key;
create unique index metric_aggregates_period_key
  on metric_aggregates (data_mode, node_id, (coalesce(bucket_id, 0)), period_start, period_seconds);

alter table node add column tap_removed boolean not null default false;

alter table sap_daily add column data_mode text not null default 'test' check (data_mode in ('test', 'production'));
alter table sap_daily drop constraint sap_daily_observed_on_node_id_key;
alter table sap_daily add unique (observed_on, node_id, data_mode);
