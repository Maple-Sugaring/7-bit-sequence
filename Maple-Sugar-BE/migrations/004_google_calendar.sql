-- Google Calendar sync: store a refresh token per user (encrypted in the app)
-- and the Calendar event id per claimed shift so withdraw/edit/delete can
-- update the right event.

alter table users add column if not exists google_refresh_token text;

alter table schedule_assignments
  add column if not exists google_event_id varchar(1024);
