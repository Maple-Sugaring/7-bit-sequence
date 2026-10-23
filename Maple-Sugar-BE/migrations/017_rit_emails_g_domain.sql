-- Store every RIT address as username@g.rit.edu (business/emailAddress.js).
--
-- Admins could invite username@rit.edu, which made a second account for
-- someone who already signs in as username@g.rit.edu. A pending rit.edu invite
-- whose g.rit.edu twin exists is dropped when nothing references it; any other
-- twin is left for an admin and reported. Every remaining rit.edu row is
-- renamed to g.rit.edu.

do $$
declare
    twin       record;
    fk         record;
    referenced boolean;
begin
    for twin in
        select r.id, r.email, r.invite_pending, r.google_sub
          from users r
          join users g on lower(g.email) = regexp_replace(lower(r.email), '@rit\.edu$', '@g.rit.edu')
         where lower(r.email) ~ '@rit\.edu$'
    loop
        referenced := false;
        if twin.invite_pending and twin.google_sub is null then
            for fk in
                select c.conrelid::regclass as tbl, a.attname as col
                  from pg_constraint c
                  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
                 where c.contype = 'f'
                   and c.confrelid = 'users'::regclass
            loop
                execute format('select exists (select 1 from %s where %I = $1)', fk.tbl, fk.col)
                   into referenced
                  using twin.id;
                exit when referenced;
            end loop;

            if not referenced then
                delete from users where id = twin.id;
                continue;
            end if;
        end if;

        raise notice 'Left % (user %) as is: its g.rit.edu twin already exists and this row is in use.',
            twin.email, twin.id;
    end loop;

    update users
       set email = regexp_replace(lower(email), '@rit\.edu$', '@g.rit.edu')
     where lower(email) ~ '@rit\.edu$'
       and not exists (
           select 1
             from users g
            where lower(g.email) = regexp_replace(lower(users.email), '@rit\.edu$', '@g.rit.edu')
       );
end
$$;
