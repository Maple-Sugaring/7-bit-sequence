-- Calibrating a node from the app, and faster packet intervals for demos.
--
-- A tare or test-weight calibration is queued here and handed to the Pi in
-- the ingest reply for that node's next packet. The node echoes the command id
-- back on a later packet, which settles the row. See business/calibration.js.

create table if not exists calibration_commands
(
    id                   integer generated always as identity primary key,
    node_id              integer not null references node (id) on delete cascade,
    action               varchar(16) not null check (action in ('tare', 'calibrate')),
    pounds               numeric(8, 3),
    status               varchar(16) not null default 'pending'
        check (status in ('pending', 'sent', 'done', 'failed', 'cancelled')),
    counts_per_lb        real,
    requested_by_user_id integer references users (id) on delete set null,
    created_at           timestamp with time zone not null default CURRENT_TIMESTAMP,
    sent_at              timestamp with time zone,
    completed_at         timestamp with time zone
);

create index if not exists calibration_commands_node_idx
  on calibration_commands (node_id, id desc);

-- The node, gateway and API all accept 10 seconds now; 60 was the old floor.
alter table node drop constraint if exists node_report_interval_check;
alter table node add constraint node_report_interval_check
  check (report_interval_seconds between 10 and 86400);
