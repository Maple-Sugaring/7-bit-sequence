-- Preserve per-recipient progress when one escalation email fails partway
-- through its recipient list. The alert can then retry only unsent addresses.
create table if not exists alert_escalation_email_deliveries (
  alert_id integer not null references alerts(id) on delete cascade,
  recipient_email text not null,
  delivered_at timestamp with time zone not null default current_timestamp,
  primary key (alert_id, recipient_email)
);
