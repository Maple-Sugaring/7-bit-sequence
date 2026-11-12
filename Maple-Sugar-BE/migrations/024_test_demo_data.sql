alter table node add column demo_fixture boolean not null default false;
alter table audit_events add column demo_fixture boolean not null default false;

create view visible_nodes as
select * from node where not demo_fixture or active_data_mode() = 'test';

create view visible_buckets as
select b.* from buckets b
where b.node_id is null or exists (select 1 from visible_nodes n where n.id = b.node_id);

insert into node (node_code, node_name, stand, tracked, status_code, battery_level, signal_rssi,
                  last_seen, battery_reported_at, signal_reported_at, demo_fixture)
select 'DEMO-' || i, 'Test · ' || site || ' ' || tree, site, true, 1,
       96 - i * 7, -68 - i * 7, now(), now(), now(), true
from (values (1, 'Alumni House', 1), (2, 'Alumni House', 2),
             (3, 'Chabad House', 1), (4, 'Chabad House', 2),
             (5, 'Red Barn', 1), (6, 'Red Barn', 2)) as fixture(i, site, tree);

insert into buckets (node_id, barcode_id, status, tare_weight, capacity_liters, tree_species)
select id, node_code || '-BUCKET', 'At Tree', 2.5, 37.85, 'Sugar Maple'
from node where demo_fixture;

insert into metrics (node_id, bucket_id, recorded_at, weight, temperature, sugar_percent,
                     weather_conditions, recorded_manually, data_mode)
select n.id, b.id, current_date - d.days + make_interval(hours => h.hour),
       round((8 + mod(n.id, 7) + 7 * (1 + sin(d.days / 3.0 + n.id)) + h.hour / 4.0)::numeric, 2),
       round((38 + 7 * sin(d.days / 4.0 + n.id))::numeric, 1),
       round((2 + mod(d.days + n.id, 8) / 10.0)::numeric, 2),
       'Test chart fixture', true, 'test'
from node n join buckets b on b.node_id = n.id
cross join generate_series(0, 29) as d(days)
cross join (values (6), (12), (18)) as h(hour)
where n.demo_fixture and current_date - d.days + make_interval(hours => h.hour) <= now();

insert into audit_events (event_type, target_id, note, created_at, demo_fixture)
select event.kind, n.id, '[Test sample] ' || n.node_name || ' — ' || event.note,
       now() - make_interval(days => event.age), true
from node n
cross join (values
  ('node_setup', 'Registered a demo node.', 6),
  ('tap_setup', 'Set up the demo tap.', 5),
  ('collection_created', 'Recorded a sample collection.', 3),
  ('measurement_overwritten', 'Changed 8.2 lb to 7.9 lb after a tare adjustment.', 1)
) as event(kind, note, age)
where n.demo_fixture;

insert into sap_daily (data_mode, observed_on, node_id, temp_min_f, temp_max_f,
                       conditions, flow_gal, sugar_percent, weight_lb, ice_present, sap_run, flow_index)
select 'test', m.recorded_at::date, m.node_id, min(m.temperature), max(m.temperature),
       'Test chart fixture', round(avg(m.weight) / 8.34, 2), round(avg(m.sugar_percent), 2),
       round(avg(m.weight), 2), false, true, 0.5
from metrics m join node n on n.id = m.node_id
where n.demo_fixture and m.data_mode = 'test'
group by m.recorded_at::date, m.node_id;

-- A request can start in Test and reach its write after a mode switch.
-- Reject any attempt to persist production data against a demo node.
create function require_test_mode_for_demo_node() returns trigger language plpgsql as $$
begin
  if new.data_mode <> 'test' and exists (select 1 from node where id = new.node_id and demo_fixture) then
    raise check_violation using message = 'Demo node data belongs to Test Mode';
  end if;
  return new;
end;
$$;

create trigger metrics_demo_mode before insert or update of node_id, data_mode on metrics
for each row execute function require_test_mode_for_demo_node();
create trigger collections_demo_mode before insert or update of node_id, data_mode on collection_logs
for each row execute function require_test_mode_for_demo_node();
create trigger journal_demo_mode before insert or update of node_id, data_mode on collection_journal
for each row execute function require_test_mode_for_demo_node();
create trigger alerts_demo_mode before insert or update of node_id, data_mode on alerts
for each row execute function require_test_mode_for_demo_node();

create function classify_demo_audit_event() returns trigger language plpgsql as $$
begin
  if not new.demo_fixture then
    new.demo_fixture := case new.event_type
      when 'measurement_overwritten' then exists (
        select 1 from metrics m join node n on n.id = m.node_id where m.id = new.target_id and n.demo_fixture
      )
      when 'collection_created' then exists (
        select 1 from collection_logs c join node n on n.id = c.node_id where c.id = new.target_id and n.demo_fixture
      )
      when 'tap_setup' then exists (select 1 from node where id = new.target_id and demo_fixture)
      when 'tap_removed' then exists (select 1 from node where id = new.target_id and demo_fixture)
      else false
    end;
  end if;
  return new;
end;
$$;

create trigger audit_events_classify_demo before insert on audit_events
for each row execute function classify_demo_audit_event();
