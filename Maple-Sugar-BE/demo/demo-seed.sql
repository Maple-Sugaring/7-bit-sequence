-- Demo-only rows for the hybrid sponsor demo. Run against the demo database
-- (project maple-demo), never the live one: it claims node ids 1-12 and bucket
-- ids 1-14 so they line up with the frontend mock data, and it would collide
-- with real registered nodes.
--
-- Nodes use their node code as lora_device_id so clearSeededData() on API boot
-- leaves them alone, and tracked = false keeps them off the real board.
-- Safe to run twice.

begin;

insert into node (id, node_code, lora_device_id, node_name, stand, status_code, tracked)
overriding system value
select n, 'NODE-' || lpad(n::text, 3, '0'), 'NODE-' || lpad(n::text, 3, '0'),
       (array['Alumni House','Chabad House','Red Barn'])[(n - 1) / 4 + 1] || ' - Tree ' || ((n - 1) % 4 + 1),
       (array['Alumni House','Chabad House','Red Barn'])[(n - 1) / 4 + 1],
       1, false
  from generate_series(1, 12) as n
on conflict (id) do nothing;

insert into buckets (id, node_id, barcode_id, status, tare_weight, capacity_liters, tree_species)
overriding system value
select b, case when b <= 12 then b end, 'BKT-' || lpad(b::text, 3, '0'),
       case when b <= 12 then 'At Tree' when b = 13 then 'Storage' else 'Cleaning' end,
       2.3, 37.85, 'Sugar Maple'
  from generate_series(1, 14) as b
on conflict (id) do nothing;

-- Explicit ids do not advance the identity sequences; do it so a node added
-- later from Deploy does not collide.
select setval(pg_get_serial_sequence('node', 'id'), greatest(12, (select max(id) from node)));
select setval(pg_get_serial_sequence('buckets', 'id'), greatest(14, (select max(id) from buckets)));

-- Shifts, relative to today in Eastern time so the schedule always looks live.
delete from schedule_slots where notes like '[demo]%';

insert into schedule_slots (task, stand, starts_at, ends_at, capacity, is_complete, notes, bucket_ids)
select task, stand,
       case when awaiting then null else (date_trunc('day', now() at time zone 'America/New_York') + (day || ' days')::interval + (hour || ' hours')::interval) at time zone 'America/New_York' end,
       case when awaiting then null else (date_trunc('day', now() at time zone 'America/New_York') + (day || ' days')::interval + ((hour + 2) || ' hours')::interval) at time zone 'America/New_York' end,
       capacity, complete, '[demo] ' || note, buckets
  from (values
    (-3, 8,  'Sap Collection', 'Alumni House', 2, true,  false, 'Finished run',                      '{1,2}'::int[]),
    (-2, 13, 'Sensor Check',   'Chabad House', 1, true,  false, 'Finished check',                    '{8}'),
    (-1, 8,  'Sap Collection', 'Red Barn',     2, false, false, 'Past and unclaimed',                '{9,10}'),
    ( 1, 8,  'Sap Collection', 'Alumni House', 2, false, false, '',                                  '{1,2,3}'),
    ( 1, 13, 'Sap Collection', 'Red Barn',     2, false, false, '',                                  '{9,10}'),
    ( 2, 8,  'Sensor Check',   'Chabad House', 1, false, false, 'Reseat the antenna on Tree 4.',     '{8}'),
    ( 2, 13, 'Battery Swap',   'Red Barn',     1, false, false, 'Tree 3 battery is nearly flat.',    '{11}'),
    ( 3, 9,  'Maintenance',    'Chabad House', 2, false, false, 'Replace the split tubing.',         '{7}'),
    ( 4, 8,  'Sap Collection', 'Alumni House', 2, false, false, '',                                  '{1,2}'),
    ( 6, 13, 'Sap Collection', 'Chabad House', 2, false, false, '',                                  '{5,6}'),
    ( 0, 0,  'Sensor Check',   'Chabad House', 1, false, true,  'Waiting for a time. Pick one from your calendar.', '{8}'),
    ( 0, 0,  'Battery Swap',   'Red Barn',     1, false, true,  'Waiting for a time. Pick one from your calendar.', '{11}')
  ) as s(day, hour, task, stand, capacity, complete, awaiting, note, buckets);

commit;
