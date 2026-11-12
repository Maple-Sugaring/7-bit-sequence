-- Reuse the historical chart fixture from 003_seed for tracked test trees.
do $$
begin
  -- Deterministic: the dashboard must look identical on every rebuild.
  perform setseed(0.20260311);

  insert into metrics (data_mode, node_id, bucket_id, recorded_manually, recorded_at,
                       weight, temperature, sugar_percent, weather_conditions,
                       fill_level_percent, sap_flow_rate_lph)
  select
    'test', n.id,
    b.id,
    true,
    reading_at,
    -- Gross weight: tare plus what has run since the last emptying.
    round((coalesce(b.tare_weight, 2.5) + flow_factor * (4 + random() * 13))::numeric, 2),
    round(temp_f::numeric, 1),
    case when random() < 0.34 then round((1.4 + random() * 2.0)::numeric, 2) else null end,
    'Test chart fixture',
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
  join node n on n.tracked
  join lateral (select id, tare_weight from buckets where node_id = n.id order by id limit 1) b on true
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
    and b.id is not null
    and not exists (
      select 1 from metrics m
      where m.data_mode = 'test' and m.node_id = n.id and m.recorded_at = reading_at
    );

end $$;

-- Populate the historical sap comparison using the same Test readings.
insert into sap_daily (data_mode, observed_on, node_id, temp_min_f, temp_max_f,
                       conditions, flow_gal, sugar_percent, weight_lb, ice_present, sap_run, flow_index)
select 'test', (recorded_at at time zone 'America/New_York')::date, node_id,
       min(temperature), max(temperature), 'Test fixture',
       round(sum(sap_flow_rate_lph) / 3.78541, 2), round(avg(sugar_percent), 2),
       round(avg(weight), 2), bool_or(ice_present), bool_or(sap_flow_rate_lph > 0),
       round(least(1, avg(sap_flow_rate_lph) / 1.6), 3)
  from metrics
 where data_mode = 'test'
   and recorded_at >= '2024-02-21' and recorded_at < '2026-04-09'
   and temperature is not null and sap_flow_rate_lph between 0 and 1.6
   and weight is not null
 group by 2, 3
on conflict (observed_on, node_id, data_mode) do nothing;
