-- Role tag on collections.
--
-- Each journal entry records the role its author held when they submitted it
-- ('Admin', 'Student' or 'MSS'), so the collection history can label who did
-- the work. It is stored rather than joined from users, so a later role change
-- does not relabel past collections.

alter table collection_journal add column if not exists submitted_role varchar(20);

-- Entries filed before this column existed take their author's current role,
-- the best record available for them.
update collection_journal j
   set submitted_role = r.role_name
  from users u
  join roles r on r.id = u.role_id
 where u.id = j.user_id
   and j.submitted_role is null;
