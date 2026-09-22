/**
 * Loads the compact daily extract and builds per-tree sap figures from it.
 *
 * The raw NOAA archive is millions of rows and is not copied into the image.
 * data/historic-weather.json is the sugaring-season daily rollup of the station
 * in that archive closest to Rochester.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../lib/logger.js';
import { queryAll } from '../db/pool.js';
import { sapRunFromTemps, poundsFromGallons } from '../business/sapFlow.js';
import { BUCKET_CAPACITY_LB, ICE_CAPACITY_LB } from '../business/thresholds.js';
import * as weatherRepository from '../repositories/weatherRepository.js';

const dataPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'data',
  'historic-weather.json',
);

const STAND_OFFSET_F = {
  'Hill Bottom': 2,
  'Rabbi House': 0.5,
  'Sugar Shack': -1,
  'North Ridge': -4,
};

export function modelSapRows(days, nodes) {
  const rows = [];

  for (const node of nodes) {
    const offset = STAND_OFFSET_F[node.stand] ?? 0;
    const factor = 0.82 + ((node.id * 13) % 35) / 100;
    const tare = Number(node.tare_weight ?? 2);
    let net = 0;

    for (const day of days) {
      const modeled = sapRunFromTemps({
        tempMinF: day.tempMinF + offset,
        tempMaxF: day.tempMaxF + offset,
        precipIn: day.precipIn,
      });
      const flowGal = Math.round(modeled.flowGal * factor * 100) / 100;
      net += poundsFromGallons(flowGal);

      const cap = modeled.ice ? ICE_CAPACITY_LB : BUCKET_CAPACITY_LB;
      const weightLb = Math.round((tare + net) * 100) / 100;
      if (net >= cap) {
        net = Math.min(cap * 0.15, poundsFromGallons(flowGal));
      }

      rows.push({
        date: day.date,
        nodeId: node.id,
        tempMinF: day.tempMinF,
        tempMaxF: day.tempMaxF,
        precipIn: day.precipIn,
        conditions: day.conditions,
        flowGal,
        sugar: modeled.sugar,
        weightLb,
        ice: modeled.ice,
        sapRun: modeled.sapRun,
        flowIndex: modeled.flowIndex,
      });
    }
  }

  return rows;
}

export async function ensureHistoricWeather() {
  const existing = await weatherRepository.countWeatherDays();
  if (existing > 0) {
    logger.info({ days: existing }, 'Historic weather already loaded');
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readFile(dataPath, 'utf8'));
  } catch (error) {
    logger.warn({ err: error }, 'Historic weather file missing; charts will be empty');
    return;
  }

  const days = payload.days ?? [];
  if (!days.length || !payload.station) {
    logger.warn('Historic weather file has no days');
    return;
  }

  await weatherRepository.insertWeatherDays(payload.station, days);

  const nodes = await queryAll(
    `select n.id, n.stand, b.tare_weight
       from node n
       left join buckets b on b.node_id = n.id
      order by n.id`,
  );

  if (nodes.length) {
    const rows = modelSapRows(days, nodes);
    await weatherRepository.insertSapDaily(rows);
    logger.info({ days: days.length, readings: rows.length }, 'Loaded historic sap series');
  }
}
