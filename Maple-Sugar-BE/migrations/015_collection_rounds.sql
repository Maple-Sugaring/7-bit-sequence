-- Round-based collection entry (issue #28).
--
-- One save now writes a reading, a journal entry, and a collection log in a
-- single transaction. The journal gains the round a collection belonged to and
-- a client-generated reference, so a phone that retries an upload after losing
-- signal cannot file the same collection twice.

alter table collection_journal add column if not exists round_label varchar(100);
alter table collection_journal add column if not exists client_ref uuid;

create unique index if not exists collection_journal_client_ref_idx
  on collection_journal (client_ref)
  where client_ref is not null;
