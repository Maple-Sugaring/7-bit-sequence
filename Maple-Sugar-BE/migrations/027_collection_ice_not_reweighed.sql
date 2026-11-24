-- Iced buckets that could not be reweighed.
--
-- With ice tagged, the student takes the bucket off the sensor, removes the
-- ice, puts it back, and turns the node off and on so it sends a fresh reading
-- within seconds. When no new reading reaches the phone within a minute (or
-- the student saves before it does), the collection is saved with the last
-- reading and flagged here, so it can be told apart from a reweighed one.
--
-- Both tables get it because the signed-in history lists collection_logs.

alter table collection_journal
  add column if not exists ice_not_reweighed boolean not null default false;

alter table collection_logs
  add column if not exists ice_not_reweighed boolean not null default false;
