-- Alert escalation (FR-025).
--
-- Stamped when an alert that stayed unresolved past ALERT_ESCALATION_MINUTES is
-- re-sent to every active admin, so the housekeeping job escalates each alert
-- once even though it re-scans the open alerts every minute.
alter table alerts add column if not exists escalated_at timestamp with time zone;

create index if not exists alerts_unescalated_idx on alerts (created_at)
  where is_resolved = false and escalated_at is null;

-- Alerts already open when this ships predate escalation. Without this, the
-- first housekeeping pass would see them all as overdue and mail and text the
-- whole crew about every old alert at once.
update alerts set escalated_at = CURRENT_TIMESTAMP where is_resolved = false and escalated_at is null;
