-- Email notifications (issue #30).
--
-- email_alerts is nullable on purpose: null means "the default for my role"
-- (admins on, everyone else off), so a later promotion to Admin starts
-- receiving critical alerts without anyone remembering to flip a flag.
alter table users add column if not exists email_alerts boolean;
alter table users add column if not exists email_shifts boolean not null default true;

-- Stamped when the shift reminder goes out, so the reminder job sends each
-- one once even though it re-scans the upcoming window every few minutes.
alter table schedule_assignments
  add column if not exists reminder_sent_at timestamp with time zone;
