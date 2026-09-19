-- Seed data mirroring src/data/fixtures/seed.js in the frontend.
--
-- The point is that switching VITE_API_MODE from `mock` to `http` shows the
-- same stands, trees, roster, and guides, so a difference on screen means a
-- real bug rather than different test data.
--
-- Reference rows are listed explicitly. The three seasons of sensor readings
-- are generated, because reproducing ~5,800 rows from the frontend's seeded
-- PRNG literally would be unreadable; the generator below reimplements the
-- same weather model instead.
--
-- Idempotent: every insert is guarded, so re-running is a no-op.

-- Explicit ids are required because the fixture alerts and schedule
-- assignments reference specific node and user ids.

-- ---------------------------------------------------------------------------
-- Roles. Ids are load-bearing: the frontend maps RoleID 1/2/3 to
-- Admin/Student/MSS positionally in ROLE_BY_ID.
-- ---------------------------------------------------------------------------

insert into roles (id, role_name) overriding system value
values (1, 'Admin'), (2, 'Student'), (3, 'MSS')
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('roles', 'id'), (select max(id) from roles));

-- ---------------------------------------------------------------------------
-- Users. google_sub is left null: it gets linked on each person's first
-- Google sign-in, which is what turns these into real logins.
-- ---------------------------------------------------------------------------

insert into users (id, role_id, first_name, last_name, email, created_at, last_login,
                   is_active, account_expiry, google_calendar_id)
  overriding system value
values
  (1, 1, 'Tom',        'Palmer',    'tpalmer@rit.edu',    '2024-01-08', '2026-09-11T12:41:00Z', true,  null,         'maple-admin@rit.edu'),
  (2, 1, 'Dana',       'Whitfield', 'dwhitfield@rit.edu', '2024-01-08', '2026-09-10T18:02:00Z', true,  null,         'maple-admin@rit.edu'),
  (3, 2, 'Innocenzio', 'Rizzuto',   'ir8643@g.rit.edu',   '2026-08-25', '2026-09-11T13:15:00Z', true,  '2026-12-19', null),
  (4, 2, 'Nolan',      'Cooper',    'nc4417@g.rit.edu',   '2026-08-25', '2026-09-09T15:30:00Z', true,  '2026-12-19', null),
  (5, 1, 'Oliver',     'Grant',     'odg1896@g.rit.edu',  '2026-08-25', '2026-09-08T09:12:00Z', true,  '2026-12-19', null),
  -- Deliberately lapsed, so the expired-account lockout has something to hit.
  (6, 2, 'Priya',      'Raman',     'pr2288@g.rit.edu',   '2025-08-26', '2026-05-02T11:00:00Z', false, '2026-05-09', null),
  (7, 3, 'Ben',        'Marino',    'bmm8699@g.rit.edu',  '2025-02-14', '2026-09-10T16:45:00Z', true,  '2027-05-14', null),
  (8, 3, 'Sofia',      'Delgado',   'sd9014@g.rit.edu',   '2025-02-14', '2026-08-30T14:20:00Z', true,  '2027-05-14', null)
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('users', 'id'), (select max(id) from users));

-- ---------------------------------------------------------------------------
-- Gateways: the Raspberry Pi units that bridge LoRa to the network.
-- ---------------------------------------------------------------------------

insert into gateway (id, gateway_code, gateway_name, ip_address, status, last_ping)
  overriding system value
values
  (1, 'GW-ALUMNI', 'Alumni House Pi',   '10.12.4.21', 'Online',  '2026-09-11T13:58:00Z'),
  (2, 'GW-SHACK',  'Sugar Shack Pi',    '10.12.4.22', 'Online',  '2026-09-11T13:57:00Z'),
  -- Down, which is what takes the two North Ridge nodes offline below.
  (3, 'GW-RELAY',  'Hill Bottom Relay', '10.12.4.23', 'Offline', '2026-09-11T04:12:00Z')
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('gateway', 'id'), (select max(id) from gateway));

-- ---------------------------------------------------------------------------
-- Nodes: four stands, four tapped trees each. Ids run stand-major, so
-- 1-4 Hill Bottom, 5-8 Rabbi House, 9-12 Sugar Shack, 13-16 North Ridge.
-- ---------------------------------------------------------------------------

insert into node (id, gateway_id, node_code, lora_device_id, node_name, status_code,
                  battery_level, signal_rssi, latitude, longitude, stand, status,
                  installed_at, last_seen)
  overriding system value
values
  (1,  1, 'NODE-001', 'E8:9F:6D:11:A2:41', 'Hill Bottom - Tree 1',  1, 92.4, -71,  43.083012, -77.678734, 'Hill Bottom', 'active',   '2026-02-20T15:00:00Z', '2026-09-11T13:52:00Z'),
  (2,  1, 'NODE-002', 'E8:9F:6D:12:A2:42', 'Hill Bottom - Tree 2',  2, 61.8, -104, 43.083411, -77.679210, 'Hill Bottom', 'degraded', '2026-02-20T15:20:00Z', '2026-09-11T13:47:00Z'),
  (3,  1, 'NODE-003', 'E8:9F:6D:13:A2:43', 'Hill Bottom - Tree 3',  1, 78.2, -83,  43.082780, -77.678102, 'Hill Bottom', 'active',   '2026-02-20T15:40:00Z', '2026-09-11T13:55:00Z'),
  (4,  1, 'NODE-004', 'E8:9F:6D:14:A2:44', 'Hill Bottom - Tree 4',  1, 88.1, -76,  43.083644, -77.679455, 'Hill Bottom', 'active',   '2026-02-20T16:00:00Z', '2026-09-11T13:50:00Z'),
  (5,  1, 'NODE-005', 'E8:9F:6D:15:A2:45', 'Rabbi House - Tree 1',  1, 70.5, -88,  43.084912, -77.680340, 'Rabbi House', 'active',   '2026-02-21T14:00:00Z', '2026-09-11T13:44:00Z'),
  (6,  1, 'NODE-006', 'E8:9F:6D:16:A2:46', 'Rabbi House - Tree 2',  1, 95.7, -68,  43.084388, -77.679812, 'Rabbi House', 'active',   '2026-02-21T14:25:00Z', '2026-09-11T13:53:00Z'),
  (7,  1, 'NODE-007', 'E8:9F:6D:17:A2:47', 'Rabbi House - Tree 3',  1, 54.3, -95,  43.085104, -77.680688, 'Rabbi House', 'active',   '2026-02-21T14:50:00Z', '2026-09-11T13:41:00Z'),
  (8,  1, 'NODE-008', 'E8:9F:6D:18:A2:48', 'Rabbi House - Tree 4',  2, 43.9, -101, 43.084566, -77.679977, 'Rabbi House', 'degraded', '2026-02-21T15:15:00Z', '2026-09-11T13:38:00Z'),
  (9,  2, 'NODE-009', 'E8:9F:6D:19:A2:49', 'Sugar Shack - Tree 1',  1, 83.6, -74,  43.081744, -77.676188, 'Sugar Shack', 'active',   '2026-02-22T13:30:00Z', '2026-09-11T13:56:00Z'),
  (10, 2, 'NODE-010', 'E8:9F:6D:1A:A2:4A', 'Sugar Shack - Tree 2',  1, 66.2, -90,  43.082233, -77.676902, 'Sugar Shack', 'active',   '2026-02-22T13:55:00Z', '2026-09-11T13:49:00Z'),
  (11, 2, 'NODE-011', 'E8:9F:6D:1B:A2:4B', 'Sugar Shack - Tree 3',  1, 91.0, -70,  43.081588, -77.675944, 'Sugar Shack', 'active',   '2026-02-22T14:20:00Z', '2026-09-11T13:54:00Z'),
  (12, 2, 'NODE-012', 'E8:9F:6D:1C:A2:4C', 'Sugar Shack - Tree 4',  1, 48.7, -98,  43.082077, -77.676733, 'Sugar Shack', 'active',   '2026-02-22T14:45:00Z', '2026-09-11T13:40:00Z'),
  (13, 3, 'NODE-013', 'E8:9F:6D:1D:A2:4D', 'North Ridge - Tree 1',  1, 57.4, -93,  43.086288, -77.681455, 'North Ridge', 'active',   '2026-02-23T12:00:00Z', '2026-09-11T13:36:00Z'),
  (14, 3, 'NODE-014', 'E8:9F:6D:1E:A2:4E', 'North Ridge - Tree 2',  1, 39.1, -100, 43.086744, -77.682210, 'North Ridge', 'active',   '2026-02-23T12:25:00Z', '2026-09-11T04:20:00Z'),
  -- Behind the downed relay: offline, and the low-battery alert target.
  (15, 3, 'NODE-015', 'E8:9F:6D:1F:A2:4F', 'North Ridge - Tree 3',  0, 6.2,  -118, 43.086102, -77.681788, 'North Ridge', 'offline',  '2026-02-23T12:50:00Z', '2026-09-11T02:14:00Z'),
  (16, 3, 'NODE-016', 'E8:9F:6D:20:A2:50', 'North Ridge - Tree 4',  0, 11.8, -121, 43.086577, -77.682644, 'North Ridge', 'offline',  '2026-02-23T13:15:00Z', '2026-09-10T22:41:00Z')
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('node', 'id'), (select max(id) from node));

-- ---------------------------------------------------------------------------
-- Buckets, one per node. tare_weight is the empty weight the load cell reads,
-- and every net-weight and gallon figure in the app subtracts it.
-- ---------------------------------------------------------------------------

-- Every tapped tree keeps its bucket on record even when the bucket is away
-- being cleaned, otherwise the tree loses its whole reading history along with
-- the tare weight needed to interpret it.
insert into buckets (id, node_id, barcode_id, status, tare_weight, capacity_liters, tree_species, installed_at)
  overriding system value
select
  n.id,
  n.id,
  'BKT-' || lpad(n.id::text, 3, '0'),
  -- The two nodes behind the downed relay have had their buckets pulled.
  case when n.id = 15 then 'Cleaning' when n.id = 16 then 'Storage' else 'At Tree' end,
  round((1.8 + ((n.id * 37) % 80) / 100.0)::numeric, 2),
  18.93,
  'Sugar Maple',
  n.installed_at
from node n
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('buckets', 'id'), (select max(id) from buckets));

-- ---------------------------------------------------------------------------
-- Alerts, verbatim from the fixtures.
-- ---------------------------------------------------------------------------

insert into alerts (id, node_id, alert_type, severity, message, is_resolved, created_at)
  overriding system value
values
  (1, 14, 'Node Offline', 'critical', 'North Ridge - Tree 2 has not reported to Hill Bottom Relay in 9 hours.', false, '2026-09-11T04:20:00Z'),
  (2, 15, 'Low Battery',  'warning',  'Battery at 6%. Solar charge has not recovered over three days of overcast.', false, '2026-09-11T06:05:00Z'),
  (3, 3,  'Spoilage',     'critical', 'Sap temperature held above 40F for 5 consecutive hours. Collect or discard.', false, '2026-09-11T11:30:00Z'),
  (4, 7,  'Full Bucket',  'warning',  'Gross weight 16.8 lb is within 1 lb of overflow. Schedule a collection.', false, '2026-09-11T12:10:00Z'),
  (5, 9,  'Tipped',       'critical', 'Load cell reported a sudden drop to below tare weight. Probable tipover.', false, '2026-09-10T21:44:00Z'),
  (6, 2,  'Signal Loss',  'warning',  'LoRa RSSI degraded to -118 dBm. Check antenna seating.', true,  '2026-09-10T08:15:00Z'),
  (7, 5,  'Full Bucket',  'warning',  'Bucket reached capacity during the March 8 run and was emptied.', true,  '2026-09-08T14:02:00Z'),
  (8, 16, 'Node Offline', 'critical', 'North Ridge - Tree 4 unreachable. Gateway relay is also down.', false, '2026-09-11T04:22:00Z')
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('alerts', 'id'), (select max(id) from alerts));

-- ---------------------------------------------------------------------------
-- Guides.
-- ---------------------------------------------------------------------------

insert into guides (guide_id, category, title, summary, steps, sort_order) values
  ('install-node', 'Installation', 'Installing an ESP32 tree node',
   'Mount the enclosure, seat the load cell, and register the node with a gateway.',
   jsonb_build_array(
     'Pick a trunk section at chest height with no active tap holes within 6 inches.',
     'Strap the IP67 enclosure to the trunk with the cable gland facing down so meltwater drains away.',
     'Hang the bucket from the HX711 load cell hook. Do not let the cable take any of the load.',
     'Run the sensor cable inside the split loom and secure it every 12 inches against squirrel damage.',
     'Power on and confirm the status LED goes solid within 60 seconds, meaning it joined the LoRa mesh.',
     'On the Nodes page, confirm the new LoRa Device ID appears and shows a signal above -100 dBm.'
   ), 1),
  ('calibrate-loadcell', 'Calibration', 'Calibrating the HX711 load cell',
   'Zero the tare and verify against a known weight. Required once per season.',
   jsonb_build_array(
     'Remove the bucket entirely and let the reading settle for 30 seconds.',
     'Hold the calibration button for 3 seconds. The LED double-blinks when the zero point is stored.',
     'Hang the empty bucket and record the displayed value as the tare weight.',
     'Hang the 5 kg reference weight and confirm the reading is within 50 g.',
     'If it is outside tolerance, repeat the zero step. Buckets are swappable without recalibration, so only recalibrate the cell itself.',
     'Enter the tare weight on the bucket record so yield math subtracts the right amount.'
   ), 2),
  ('refractometer', 'Collection', 'Taking a Brix reading with the refractometer',
   'Manual sugar content measurement to pair with an automated weight reading.',
   jsonb_build_array(
     'Rinse the prism with distilled water and dry it with the lens cloth. Residue skews the reading high.',
     'Let the sap sample reach roughly the same temperature as the refractometer.',
     'Place two or three drops on the prism and close the cover plate with no air bubbles.',
     'Read the value at the boundary line against a light source.',
     'Record it on the Record Data page against the correct tree. Raw sap is normally 1.5 to 3 percent.',
     'Rinse and dry the prism again before the next tree to avoid carryover.'
   ), 3),
  ('solar-maintenance', 'Maintenance', 'Clearing a solar panel and checking battery health',
   'What to do when a node reports low battery during an overcast stretch.',
   jsonb_build_array(
     'Brush snow and ice off the panel face with the soft brush. Never scrape with a tool.',
     'Check the panel is still angled south at roughly 45 degrees.',
     'Inspect the connector for green corrosion and reseat it until it clicks.',
     'Open the enclosure only if the interior desiccant pack has turned pink, then swap the pack.',
     'If the battery stays under 20 percent after a full sunny day, swap in a charged Li-ion pack.',
     'Resolve the Low Battery alert on the Alerts page so it stops escalating.'
   ), 4),
  ('gateway-recovery', 'Maintenance', 'Recovering an offline Raspberry Pi gateway',
   'Steps to take when every node behind one gateway goes dark at once.',
   jsonb_build_array(
     'Confirm the whole stand is offline rather than one node. That points at the gateway, not the trees.',
     'Check the gateway has power and that the UPS is not running on battery.',
     'Power cycle the Pi and wait two full minutes for the LoRa service to come back.',
     'Buffered readings on the node SD cards upload automatically once the mesh reforms. Do not clear them.',
     'Verify on the Nodes page that last-seen timestamps start advancing again.',
     'If it stays offline past 30 minutes, escalate to an admin.'
   ), 5)
on conflict (guide_id) do nothing;

-- ---------------------------------------------------------------------------
-- Sensor readings for three seasons.
--
-- Reimplements the fixture weather model: sap only runs on a freeze/thaw
-- cycle, so ambient dips below freezing overnight and climbs past 40F midday.
-- The curve drifts warmer across the season, which is what ends the run. Each
-- stand carries a microclimate offset, so a sheltered hollow and an exposed
-- ridge disagree about whether sap is spoiling.
-- ---------------------------------------------------------------------------

do $$
declare
  reading_count integer;
begin
  select count(*) into reading_count from metrics;
  if reading_count > 0 then
    raise notice 'metrics already populated, skipping generation';
    return;
  end if;

  -- Deterministic: the dashboard must look identical on every rebuild.
  perform setseed(0.20260311);

  insert into metrics (node_id, bucket_id, recorded_by_user_id, recorded_at,
                       weight, temperature, sugar_percent, weather_conditions,
                       fill_level_percent, sap_flow_rate_lph)
  select
    n.id,
    b.id,
    -- Null when the ESP32 reported automatically; set when a student keyed in
    -- a refractometer reading, which only happens on the midday round.
    case when s.hour = 12 and random() < 0.22
         then (array[3, 4, 5])[1 + floor(random() * 3)::int]
         else null end,
    reading_at,
    -- Gross weight: tare plus what has run since the last emptying.
    round((b.tare_weight + flow_factor * (4 + random() * 13))::numeric, 2),
    round(temp_f::numeric, 1),
    case when random() < 0.34 then round((1.4 + random() * 2.0)::numeric, 2) else null end,
    (array['Clear', 'Overcast', 'Snowing', 'Light Rain', 'Partly Cloudy', 'Freezing Fog'])[1 + floor(random() * 6)::int],
    round((flow_factor * 100)::numeric, 2),
    round((flow_factor * 1.6)::numeric, 2)
  from (values
      -- season, start date, warmth offset (F), length (days)
      (2024, date '2024-02-24', 0.0,  38),
      (2025, date '2025-02-21', 2.5,  31),
      (2026, date '2026-02-27', -1.5, 40)
    ) as season(year, start_date, warmth, length_days)
  cross join generate_series(0, 45) as day_offset(n)
  cross join (values (6), (12), (18)) as s(hour)
  join node n on true
  left join buckets b on b.node_id = n.id
  cross join lateral (
    select
      (season.start_date + day_offset.n) + (s.hour || ' hours')::interval as reading_at,
      -- Seasonal warming drift, stand microclimate, and a diurnal sine phase
      -- shifted so the peak lands mid-afternoon rather than at noon.
      24
        + (day_offset.n::numeric / 40) * 12
        + season.warmth
        + case n.stand
            when 'Hill Bottom' then 2.0
            when 'Rabbi House' then 0.5
            when 'Sugar Shack' then -1.0
            when 'North Ridge' then -4.0
            else 0 end
        + sin(((s.hour - 8)::numeric / 24) * 2 * pi()) * 11
        + (random() * 5 - 2.5) as temp_f
  ) as weather
  cross join lateral (
    -- Sap runs on the thaw, so flow tracks how far above freezing it got.
    select greatest(0, least(1, (weather.temp_f - 32) / 14)) as flow_factor
  ) as flow
  where day_offset.n < season.length_days
    -- Offline nodes stopped reporting near the end of the current season but
    -- were healthy in prior years.
    and not (season.year = 2026 and n.status_code = 0 and day_offset.n > season.length_days - 6)
    and b.id is not null;

  raise notice 'generated % sensor readings', (select count(*) from metrics);
end $$;

-- ---------------------------------------------------------------------------
-- Collection logs: a student empties roughly half the buckets every third day.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from collection_logs) then
    raise notice 'collection_logs already populated, skipping generation';
    return;
  end if;

  perform setseed(0.42);

  insert into collection_logs (bucket_id, node_id, user_id, collected_at,
                              volume_collected, quality_notes)
  select
    b.id,
    b.node_id,
    (array[3, 4, 5, 6])[1 + floor(random() * 4)::int],
    (season.start_date + day_offset.n) + interval '15 hours' + (floor(random() * 59) || ' minutes')::interval,
    round((0.9 + random() * 1.5)::numeric, 2),
    (array['Clear', 'Clear', 'Slightly cloudy', 'Bark fragments', 'Bug found', ''])[1 + floor(random() * 6)::int]
  from (values
      (2024, date '2024-02-24', 38),
      (2025, date '2025-02-21', 31),
      (2026, date '2026-02-27', 40)
    ) as season(year, start_date, length_days)
  cross join generate_series(2, 45, 3) as day_offset(n)
  join buckets b on b.node_id is not null
  where day_offset.n < season.length_days
    and random() < 0.45;

  raise notice 'generated % collection logs', (select count(*) from collection_logs);
end $$;

-- ---------------------------------------------------------------------------
-- Schedule: a fortnight of shifts anchored to the current week, so the
-- schedule always looks live no matter when the database is built.
-- ---------------------------------------------------------------------------

do $$
declare
  slot record;
begin
  if exists (select 1 from schedule_slots) then
    raise notice 'schedule_slots already populated, skipping generation';
    return;
  end if;

  perform setseed(0.777);

  insert into schedule_slots (task, stand, starts_at, ends_at, capacity, is_complete)
  select
    (array['Sap Collection', 'Sensor Calibration', 'Battery Swap', 'Line Cleaning'])[1 + floor(random() * 4)::int],
    (array['Hill Bottom', 'Rabbi House', 'Sugar Shack', 'North Ridge'])[1 + floor(random() * 4)::int],
    shift_start,
    shift_start + interval '2 hours',
    2,
    shift_start < now()
  from (
    select date_trunc('week', now()) + (d || ' days')::interval + (h || ' hours')::interval as shift_start
    from generate_series(0, 13) as d
    cross join (values (8), (13)) as hours(h)
    -- No Sunday shifts.
    where extract(dow from date_trunc('week', now()) + (d || ' days')::interval) <> 0
  ) as slots
  order by shift_start;

  -- Roughly 45 percent of shifts have a student signed up already. Past ones
  -- that were claimed are marked complete above.
  for slot in select id from schedule_slots loop
    if random() < 0.45 then
      insert into schedule_assignments (slot_id, user_id)
      values (slot.id, (array[3, 4, 5])[1 + floor(random() * 3)::int])
      on conflict do nothing;
    end if;
  end loop;

  -- An unclaimed shift cannot have been completed.
  update schedule_slots s
     set is_complete = false
   where s.is_complete
     and not exists (select 1 from schedule_assignments a where a.slot_id = s.id);
end $$;
