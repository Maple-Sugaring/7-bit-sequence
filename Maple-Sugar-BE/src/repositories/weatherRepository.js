import { query, queryAll, queryOne } from '../db/pool.js';

function num(value) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapDay(row) {
  return {
    Date: String(row.observed_on).slice(0, 10),
    Temp_Min_F: num(row.temp_min_f),
    Temp_Max_F: num(row.temp_max_f),
    Precip_In: num(row.precip_in),
    Conditions: row.conditions,
    Flow_Gal: num(row.flow_gal),
    Sugar_Percent: num(row.sugar_percent),
    Weight_Lb: num(row.weight_lb),
    Ice_Present: Boolean(row.ice_present),
    Sap_Run: Boolean(row.sap_run),
    Flow_Index: num(row.flow_index),
  };
}

export async function listDaily({ year, nodeId } = {}) {
  if (nodeId != null) {
    const rows = await queryAll(
      `select observed_on::text as observed_on,
              temp_min_f, temp_max_f, precip_in, conditions,
              flow_gal, sugar_percent, weight_lb, ice_present, sap_run, flow_index
         from sap_daily
        where node_id = $1
          and ($2::int is null or extract(year from observed_on) = $2)
        order by observed_on`,
      [nodeId, year ?? null],
    );
    return rows.map(mapDay);
  }

  const rows = await queryAll(
    `select observed_on::text as observed_on,
            round(avg(temp_min_f)::numeric, 1) as temp_min_f,
            round(avg(temp_max_f)::numeric, 1) as temp_max_f,
            round(avg(precip_in)::numeric, 3) as precip_in,
            max(conditions) as conditions,
            round(sum(flow_gal)::numeric, 2) as flow_gal,
            round(avg(sugar_percent)::numeric, 2) as sugar_percent,
            round(avg(weight_lb)::numeric, 2) as weight_lb,
            bool_or(ice_present) as ice_present,
            bool_or(sap_run) as sap_run,
            round(avg(flow_index)::numeric, 3) as flow_index
       from sap_daily
      where $1::int is null or extract(year from observed_on) = $1
      group by observed_on
      order by observed_on`,
    [year ?? null],
  );
  return rows.map(mapDay);
}

export async function compareYear(year) {
  const rows = await queryAll(
    `select s.observed_on::text as observed_on,
            s.node_id,
            n.node_name,
            n.stand,
            s.flow_gal,
            s.sugar_percent,
            s.temp_max_f,
            s.temp_min_f,
            s.weight_lb,
            s.sap_run
       from sap_daily s
       join node n on n.id = s.node_id
      where n.tracked
        and extract(year from s.observed_on) = $1
      order by n.stand, n.id, s.observed_on`,
    [year],
  );

  const nodes = new Map();
  for (const row of rows) {
    let node = nodes.get(row.node_id);
    if (!node) {
      node = {
        NodeID: row.node_id,
        Node_Name: row.node_name,
        Stand: row.stand,
        Points: [],
      };
      nodes.set(row.node_id, node);
    }
    node.Points.push({
      Date: String(row.observed_on).slice(0, 10),
      Flow_Gal: num(row.flow_gal),
      Sugar_Percent: num(row.sugar_percent),
      Temp_Max_F: num(row.temp_max_f),
      Temp_Min_F: num(row.temp_min_f),
      Weight_Lb: num(row.weight_lb),
      Sap_Run: Boolean(row.sap_run),
    });
  }
  return [...nodes.values()];
}

export async function stationSummary() {
  const row = await queryOne(
    `select station_id, station_name, latitude, longitude, count(*)::int as days
       from weather_days
      group by station_id, station_name, latitude, longitude
      order by days desc
      limit 1`,
  );
  if (!row) return null;
  return {
    Station_ID: row.station_id,
    Station_Name: row.station_name,
    Latitude: num(row.latitude),
    Longitude: num(row.longitude),
    Days: row.days,
  };
}

export async function latestLive() {
  return queryOne(
    `select flow_index, sap_run, temp_min_f, temp_max_f
       from weather_live
      order by observed_at desc
      limit 1`,
  );
}

export async function insertLive(snapshot) {
  await query(
    `insert into weather_live
       (temp_f, temp_min_f, temp_max_f, conditions, precip_in, flow_index, sap_run, summary)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      snapshot.tempF,
      snapshot.tempMinF,
      snapshot.tempMaxF,
      snapshot.conditions,
      snapshot.precipIn,
      snapshot.flowIndex,
      snapshot.sapRun,
      snapshot.summary,
    ],
  );
}

export async function countWeatherDays() {
  const row = await queryOne('select count(*)::int as n from weather_days');
  return row?.n ?? 0;
}

export async function insertWeatherDays(station, days) {
  const chunkSize = 80;
  for (let index = 0; index < days.length; index += chunkSize) {
    const group = days.slice(index, index + chunkSize);
    const params = [];
    const values = group.map((day, offset) => {
      const base = offset * 9;
      params.push(
        day.date,
        station.id,
        station.name,
        station.latitude,
        station.longitude,
        day.tempMinF,
        day.tempMaxF,
        day.precipIn,
        day.conditions,
      );
      const slots = Array.from({ length: 9 }, (_, column) => `$${base + column + 1}`);
      return `(${slots.join(', ')}, 'noaa-isd')`;
    });
    await query(
      `insert into weather_days
         (observed_on, station_id, station_name, latitude, longitude,
          temp_min_f, temp_max_f, precip_in, conditions, source)
       values ${values.join(', ')}
       on conflict (observed_on, station_id, source) do nothing`,
      params,
    );
  }
}

export async function insertSapDaily(rows) {
  const chunkSize = 80;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const group = rows.slice(index, index + chunkSize);
    const params = [];
    const values = group.map((row, offset) => {
      const base = offset * 12;
      params.push(
        row.date,
        row.nodeId,
        row.tempMinF,
        row.tempMaxF,
        row.precipIn,
        row.conditions,
        row.flowGal,
        row.sugar,
        row.weightLb,
        row.ice,
        row.sapRun,
        row.flowIndex,
      );
      const slots = Array.from({ length: 12 }, (_, column) => `$${base + column + 1}`);
      return `(${slots.join(', ')})`;
    });
    await query(
      `insert into sap_daily
         (observed_on, node_id, temp_min_f, temp_max_f, precip_in, conditions,
          flow_gal, sugar_percent, weight_lb, ice_present, sap_run, flow_index)
       values ${values.join(', ')}
       on conflict (observed_on, node_id) do nothing`,
      params,
    );
  }
}
