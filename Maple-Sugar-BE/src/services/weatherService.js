/**
 * Live sugarbush weather from OpenWeather, plus the stored historic series.
 *
 * A freeze-thaw that is stronger than the previous snapshot raises a sap-run
 * alert. The key is optional so the API still boots when it is unset.
 */

import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { ApiError } from '../lib/ApiError.js';
import { CAMPUS_SITES } from '../business/sites.js';
import { describeSapChange, sapRunFromTemps } from '../business/sapFlow.js';
import { SUGARBUSH_TIME_ZONE, formatZoneDate } from '../business/availability.js';
import * as weatherRepository from '../repositories/weatherRepository.js';
import * as alertsRepository from '../repositories/alertsRepository.js';
import { cacheNamespaces } from '../cache/cacheKeys.js';
import { invalidateNamespaces } from '../cache/redisCache.js';

const OPEN_WEATHER = 'https://api.openweathermap.org/data/2.5';
const CACHE_MS = 10 * 60 * 1000;

let memory = null;
let memoryAt = 0;

function zoneDate(epochSeconds) {
  return formatZoneDate(new Date(epochSeconds * 1000), SUGARBUSH_TIME_ZONE);
}

function groupForecast(list) {
  const byDate = new Map();
  for (const item of list ?? []) {
    const date = zoneDate(item.dt);
    const bucket = byDate.get(date) ?? {
      date,
      tempMinF: item.main.temp,
      tempMaxF: item.main.temp,
      precipMm: 0,
      conditions: item.weather?.[0]?.main ?? 'Clear',
    };
    bucket.tempMinF = Math.min(bucket.tempMinF, item.main.temp_min ?? item.main.temp);
    bucket.tempMaxF = Math.max(bucket.tempMaxF, item.main.temp_max ?? item.main.temp);
    bucket.precipMm += item.rain?.['3h'] ?? item.snow?.['3h'] ?? 0;
    byDate.set(date, bucket);
  }

  return [...byDate.values()].map((day) => {
    const precipIn = Math.round((day.precipMm / 25.4) * 1000) / 1000;
    const modeled = sapRunFromTemps({
      tempMinF: day.tempMinF,
      tempMaxF: day.tempMaxF,
      precipIn,
    });
    return {
      Date: day.date,
      Temp_Min_F: Math.round(day.tempMinF * 10) / 10,
      Temp_Max_F: Math.round(day.tempMaxF * 10) / 10,
      Precip_In: precipIn,
      Conditions: day.conditions,
      Sap_Run: modeled.sapRun,
      Flow_Index: modeled.flowIndex,
      Flow_Gal: modeled.flowGal,
      Ice_Present: modeled.ice,
    };
  });
}

function harshWeather({ tempMinF, tempMaxF, precipIn, windMph, description }) {
  const found = [];
  const sky = String(description ?? '').toLowerCase();

  if (tempMinF != null && tempMinF <= 0) {
    found.push({
      Alert_Type: 'Extreme Cold',
      severity: 'critical',
      Description: `Overnight low ${tempMinF}°F at the sugarbush. Buckets can freeze solid. Check them once it is safe to walk.`,
    });
  }

  if (windMph != null && windMph >= 25) {
    found.push({
      Alert_Type: 'High Wind',
      severity: windMph >= 40 ? 'critical' : 'warning',
      Description: `Wind about ${Math.round(windMph)} mph. Buckets tip easily in this. Look for a spill after it eases.`,
    });
  }

  if (precipIn != null && precipIn >= 0.5) {
    found.push({
      Alert_Type: 'Heavy Precipitation',
      severity: 'warning',
      Description: `About ${precipIn.toFixed(2)} in of precipitation today. Rain dilutes sap. Snow and ice add weight above the 10 gallon line.`,
    });
  }

  if (sky.includes('ice') || sky.includes('freezing rain') || sky.includes('sleet')) {
    found.push({
      Alert_Type: 'Ice Storm',
      severity: 'critical',
      Description: `The forecast says ${description}. Stay off the sugarbush until it is safe, then check every bucket for a tip or a freeze.`,
    });
  }

  if (tempMaxF != null && tempMaxF <= 20 && tempMinF != null && tempMinF < 32) {
    found.push({
      Alert_Type: 'Hard Freeze',
      severity: 'warning',
      Description: `The day only reaches ${tempMaxF}°F after a low of ${tempMinF}°F. Expect ice in the buckets rather than a liquid run.`,
    });
  }

  return found;
}

async function fetchJson(url) {
  const response = await fetch(url);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.message ?? `OpenWeather ${response.status}`;
    throw new ApiError(message, { status: 502, code: 'WEATHER_FAILED' });
  }
  return payload;
}

export async function getDaily({ year, nodeId }) {
  const [days, station] = await Promise.all([
    weatherRepository.listDaily({ year, nodeId }),
    weatherRepository.stationSummary(),
  ]);
  return {
    Station: station,
    Reference: 'Rochester, NY',
    Note: station
      ? 'Daily sap follows the nearest station in the NOAA archive, placed on the Alumni House, Chabad House, and Red Barn taps.'
      : 'Historic weather has not been loaded.',
    Days: days,
  };
}

export async function getCompare(year) {
  return { Year: year, Nodes: await weatherRepository.compareYear(year) };
}

export async function getLive() {
  if (!config.openWeatherApiKey) {
    return {
      Configured: false,
      Message: 'Set OPENWEATHER_API_KEY on the API service to load live weather.',
      Latitude: config.sugarbushLatitude,
      Longitude: config.sugarbushLongitude,
    };
  }

  if (memory && Date.now() - memoryAt < CACHE_MS) return memory;

  const key = encodeURIComponent(config.openWeatherApiKey);
  const sites = await Promise.all(
    CAMPUS_SITES.map(async (site) => {
      const query = `lat=${site.latitude}&lon=${site.longitude}&units=imperial&appid=${key}`;
      const [current, forecast] = await Promise.all([
        fetchJson(`${OPEN_WEATHER}/weather?${query}`),
        fetchJson(`${OPEN_WEATHER}/forecast?${query}`),
      ]);
      const days = groupForecast(forecast.list);
      const todayKey = formatZoneDate(new Date(), SUGARBUSH_TIME_ZONE);
      const today = days.find((day) => day.Date === todayKey) ?? days[0];
      const modeled = sapRunFromTemps({
        tempMinF: (today?.Temp_Min_F ?? current.main.temp) + site.offsetF,
        tempMaxF: (today?.Temp_Max_F ?? current.main.temp) + site.offsetF,
        precipIn: today?.Precip_In ?? (current.rain?.['1h'] ?? 0) / 25.4,
      });
      return {
        site,
        current,
        days,
        today,
        modeled,
      };
    }),
  );

  const primary = sites[0];
  const current = primary.current;
  const days = primary.days;
  const today = primary.today;
  const modeled = primary.modeled;

  const previousRow = await weatherRepository.latestLive();
  const previous = previousRow
    ? {
        sapRun: previousRow.sap_run,
        flowIndex: Number(previousRow.flow_index ?? 0),
        tempMinF: Number(previousRow.temp_min_f),
        tempMaxF: Number(previousRow.temp_max_f),
      }
    : null;
  const change = describeSapChange({
    today: {
      sapRun: modeled.sapRun,
      flowIndex: modeled.flowIndex,
      flowGal: modeled.flowGal,
      tempMinF: Math.round((today?.Temp_Min_F ?? current.main.temp) * 10) / 10,
      tempMaxF: Math.round((today?.Temp_Max_F ?? current.main.temp) * 10) / 10,
    },
    previous,
  });

  const pending = [];
  if (change.increased) {
    pending.push({
      Alert_Type: 'Sap Run',
      severity: 'info',
      Description: change.summary,
    });
  }
  pending.push(
    ...harshWeather({
      tempMinF: today?.Temp_Min_F ?? null,
      tempMaxF: today?.Temp_Max_F ?? null,
      precipIn: today?.Precip_In ?? 0,
      windMph: current.wind?.speed ?? null,
      description: current.weather?.[0]?.description ?? today?.Conditions,
    }),
  );

  let raised = false;
  for (const candidate of pending) {
    if (await alertsRepository.hasOpenAlertOfType(null, candidate.Alert_Type)) continue;
    await alertsRepository.createAlert({ ...candidate, NodeID: null });
    raised = true;
  }
  if (raised) {
    await invalidateNamespaces([cacheNamespaces.ALERTS]);
    logger.info({ types: pending.map((item) => item.Alert_Type) }, 'Raised weather alerts');
  }

  await weatherRepository.insertLive({
    tempF: current.main.temp,
    tempMinF: today?.Temp_Min_F ?? null,
    tempMaxF: today?.Temp_Max_F ?? null,
    conditions: current.weather?.[0]?.description ?? null,
    precipIn: today?.Precip_In ?? 0,
    flowIndex: modeled.flowIndex,
    sapRun: modeled.sapRun,
    summary: change.summary,
  });

  memory = {
    Configured: true,
    Location_Label: 'RIT campus',
    Latitude: CAMPUS_SITES[0].latitude,
    Longitude: CAMPUS_SITES[0].longitude,
    Sites: sites.map(({ site, current: reading, days: forecastDays, today: day, modeled: run }) => ({
      Name: site.name,
      Latitude: site.latitude,
      Longitude: site.longitude,
      Temperature_F: Math.round(reading.main.temp * 10) / 10,
      Temp_Min_F: day?.Temp_Min_F ?? null,
      Temp_Max_F: day?.Temp_Max_F ?? null,
      Description: reading.weather?.[0]?.description ?? null,
      Sap_Run: run.sapRun,
      Flow_Gal: run.flowGal,
      Summary: describeSapChange({
        today: {
          sapRun: run.sapRun,
          flowIndex: run.flowIndex,
          flowGal: run.flowGal,
          tempMinF: day?.Temp_Min_F ?? reading.main.temp,
          tempMaxF: day?.Temp_Max_F ?? reading.main.temp,
        },
        previous: null,
      }).summary,
      Forecast: forecastDays,
    })),
    Observed_At: new Date(current.dt * 1000).toISOString(),
    Temperature_F: Math.round(current.main.temp * 10) / 10,
    Temp_Min_F: today?.Temp_Min_F ?? null,
    Temp_Max_F: today?.Temp_Max_F ?? null,
    Conditions: current.weather?.[0]?.main ?? null,
    Description: current.weather?.[0]?.description ?? null,
    Sap_Run: modeled.sapRun,
    Flow_Index: modeled.flowIndex,
    Flow_Gal: modeled.flowGal,
    Ice_Present: modeled.ice,
    Flow_Change: change.flowChange,
    Summary: change.summary,
    Forecast: days,
  };
  memoryAt = Date.now();
  return memory;
}
