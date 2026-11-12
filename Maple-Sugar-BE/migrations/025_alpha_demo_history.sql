-- Anchor the historical window to the original demo nodes' creation date.
insert into metrics (node_id, bucket_id, recorded_at, weight, temperature, sugar_percent,
                     sap_flow_rate_lph, weather_conditions, recorded_manually, data_mode)
select n.id, b.id, sample.at,
       round((14 + 8 * sin(d.age / 4.0 + n.id) + h.hour / 4.0)::numeric, 2),
       round((39 + 9 * sin(d.age / 5.0 + n.id))::numeric, 1),
       round((2 + mod(d.age + n.id, 12) / 10.0)::numeric, 2),
       round((0.75 + 0.7 * sin(d.age / 4.0 + n.id))::numeric, 2),
       'Test chart fixture', true, 'test'
from node n join buckets b on b.barcode_id = n.node_code || '-BUCKET' and b.node_id = n.id
cross join generate_series(30, 89) as d(age)
cross join (values (6), (12), (18)) as h(hour)
cross join lateral (select n.installed_at::date - d.age + make_interval(hours => h.hour) as at) sample
where n.demo_fixture and n.node_code ~ '^DEMO-[1-6]$'
  and not exists (
    select 1 from metrics m where m.node_id = n.id and m.recorded_at = sample.at and m.data_mode = 'test'
  );

insert into sap_daily (data_mode, observed_on, node_id, temp_min_f, temp_max_f,
                       conditions, flow_gal, sugar_percent, weight_lb, ice_present, sap_run, flow_index)
select 'test', m.recorded_at::date, m.node_id, min(m.temperature), max(m.temperature),
       'Test chart fixture', round(sum(m.sap_flow_rate_lph) / 3.78541, 2), round(avg(m.sugar_percent), 2),
       round(avg(m.weight), 2), false, true, round(avg(m.sap_flow_rate_lph) / 1.6, 3)
from metrics m join node n on n.id = m.node_id
where n.demo_fixture and n.node_code ~ '^DEMO-[1-6]$' and m.data_mode = 'test'
  and m.weather_conditions = 'Test chart fixture' and m.sap_flow_rate_lph is not null
  and m.recorded_at::date between n.installed_at::date - 89 and n.installed_at::date - 30
group by m.recorded_at::date, m.node_id
on conflict (observed_on, node_id, data_mode) do nothing;

-- The journal's unique client reference gates all three collection writes.
with new_entries as (
  insert into collection_journal (node_id, bucket_id, collected_at, title, process_notes,
                                  weight_lb, sugar_percent, round_label, client_ref, data_mode)
  select n.id, b.id, n.installed_at::date - (r.round * 4) + interval '15 hours',
         'Test collection · ' || n.node_name, '[Test sample] Bucket emptied and sugar checked.',
         18 + r.round + mod(n.id, 6), 2.1 + mod(n.id + r.round, 9) / 10.0,
         'Test collection round ' || r.round,
         md5('alpha-demo-round:' || r.round || ':' || n.node_code)::uuid, 'test'
  from node n join buckets b on b.barcode_id = n.node_code || '-BUCKET' and b.node_id = n.id
  cross join generate_series(1, 6) as r(round)
  where n.demo_fixture and n.node_code ~ '^DEMO-[1-6]$'
    and mod(right(n.node_code, 1)::int + r.round, 6) < 4
  on conflict (client_ref) where client_ref is not null do nothing
  returning node_id, bucket_id, collected_at, weight_lb, sugar_percent, round_label
), readings as (
  insert into metrics (node_id, bucket_id, recorded_at, weight, sugar_percent,
                       weather_conditions, recorded_manually, data_mode)
  select node_id, bucket_id, collected_at, weight_lb, sugar_percent, 'Test collection', true, 'test'
  from new_entries
), logs as (
  insert into collection_logs (node_id, bucket_id, collected_at, volume_collected, quality_notes, data_mode)
  select e.node_id, e.bucket_id, e.collected_at, round((e.weight_lb - b.tare_weight) / 8.34, 2),
         '[Test sample] ' || e.round_label, 'test'
  from new_entries e join buckets b on b.id = e.bucket_id
  returning id, collected_at, quality_notes
)
insert into audit_events (event_type, target_id, note, created_at, demo_fixture)
select 'collection_created', id, quality_notes || ' · bucket collected.', collected_at, true from logs;

insert into alerts (node_id, alert_type, severity, message, is_resolved, created_at, data_mode)
select n.id, sample.kind, sample.severity, sample.message, sample.resolved,
       n.installed_at - make_interval(days => sample.age), 'test'
from node n
cross join (values
  ('Full Bucket', 'warning', '[Test sample] Bucket is nearly full.', false, 1),
  ('Low Battery', 'warning', '[Test sample] Battery pack replaced.', true, 7),
  ('Spoilage', 'critical', '[Test sample] Warm sap was collected.', true, 14)
) as sample(kind, severity, message, resolved, age)
where n.demo_fixture and n.node_code ~ '^DEMO-[1-6]$'
  and not exists (select 1 from alerts a where a.node_id = n.id and a.message = sample.message and a.data_mode = 'test');

insert into sensor_lifecycle_events (node_id, event_type, event_date, sensor_type, notes)
select n.id, sample.kind, n.installed_at::date - sample.age, sample.sensor_type, sample.notes
from node n
cross join (values
  ('installation', 120, 'Generic 5–10 kg C3 four-point load-cell kit', '[Test sample] Initial installation.'),
  ('maintenance', 21, null, '[Test sample] Checked cable and verified zero.'),
  ('replacement', 10, 'Generic 5–10 kg C3 four-point load-cell kit', '[Test sample] Replaced worn load cell.')
) as sample(kind, age, sensor_type, notes)
where n.demo_fixture and n.node_code ~ '^DEMO-[1-6]$'
  and (sample.kind = 'installation'
       or sample.kind = 'maintenance' and n.node_code in ('DEMO-1', 'DEMO-4')
       or sample.kind = 'replacement' and n.node_code = 'DEMO-5')
  and not exists (
    select 1 from sensor_lifecycle_events e where e.node_id = n.id and e.notes = sample.notes
  );
