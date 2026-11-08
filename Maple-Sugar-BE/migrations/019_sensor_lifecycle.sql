alter table node
  add column battery_reported_at timestamptz,
  add column signal_reported_at timestamptz;

create table sensor_lifecycle_events (
  id integer generated always as identity primary key,
  node_id integer not null references node(id) on delete cascade,
  event_type text not null check (event_type in ('installation', 'replacement', 'maintenance')),
  event_date date not null,
  sensor_type text,
  notes text,
  assumed boolean not null default false,
  recorded_by integer references users(id) on delete set null,
  recorded_at timestamptz not null default current_timestamp,
  check (event_type = 'maintenance' or sensor_type is not null)
);

create index sensor_lifecycle_node_date on sensor_lifecycle_events (node_id, event_date desc, id desc);

insert into sensor_lifecycle_events (node_id, event_type, event_date, sensor_type, assumed)
select id, 'installation', date '2026-10-25', 'Generic 5–10 kg C3 four-point load-cell kit', true
from node;
