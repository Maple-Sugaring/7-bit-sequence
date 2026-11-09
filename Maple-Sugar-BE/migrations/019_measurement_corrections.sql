alter table users add column can_overwrite_measurements boolean not null default true;
alter table metrics
  add column revision integer not null default 0,
  add column correction_note text;

create table audit_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  actor_id integer,
  target_id integer not null,
  note text not null,
  created_at timestamptz not null default current_timestamp
);

create function reject_audit_event_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'Audit events are append-only';
end;
$$;

create trigger audit_events_append_only
  before update or delete or truncate on audit_events
  for each statement execute function reject_audit_event_mutation();
