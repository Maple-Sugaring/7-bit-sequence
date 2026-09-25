-- Fixture alerts inserted by 003_seed.sql. Hardware has not raised these.
delete from alerts where id <= 8 and created_at < timestamp '2026-09-12 00:00:00+00';
