import * as alertsRepository from '../data/repositories/alertsRepository';
import * as bucketsRepository from '../data/repositories/bucketsRepository';
import * as collectionLogsRepository from '../data/repositories/collectionLogsRepository';
import * as metricsRepository from '../data/repositories/metricsRepository';
import * as nodesRepository from '../data/repositories/nodesRepository';
import { cacheKeys, TTL } from '../data/cache/cacheKeys';
import { readThrough } from '../data/cache/queryCache';
import {
  alignSeasonSeries,
  availableSeasons,
  average,
  dailySeries,
  dailyTotals,
  percentChange,
  seasonComparisonSeries,
  seasonOf,
} from '../business/aggregation';
import { assessSpoilage, SpoilageRisk } from '../business/spoilage';
import { shelfLifeFromReadings } from '../business/shelfLife';
import { totalCollected, yieldEfficiency } from '../business/yieldMetrics';
import { enrichReadings } from './metricsService';

/**
 * Assembles everything the dashboard renders in one pass so the KPI cards and
 * the charts cannot disagree, and caches the result under the same key the
 * backend will use for its Redis rollup.
 */

function healthSummary(nodes, gateways) {
  return {
    total: nodes.length,
    online: nodes.filter((node) => node.Status_Code === 1).length,
    degraded: nodes.filter((node) => node.Status_Code === 2).length,
    offline: nodes.filter((node) => node.Status_Code === 0).length,
    averageBattery: average(nodes, 'Battery_Percent'),
    lowBattery: nodes.filter((node) => node.Battery_Percent != null && node.Battery_Percent < 20),
    gatewaysOnline: gateways.filter((gateway) => gateway.Status === 'Online').length,
    gatewaysTotal: gateways.length,
  };
}

export async function getDashboard({ season } = {}) {
  const [allMetrics, nodes, buckets, gateways, alerts, logs] = await Promise.all([
    metricsRepository.listMetrics(),
    nodesRepository.listNodes(),
    bucketsRepository.listBuckets(),
    nodesRepository.listGateways(),
    alertsRepository.listAlerts(),
    collectionLogsRepository.listCollectionLogs(),
  ]);

  const seasons = availableSeasons(allMetrics);
  const activeSeason = season ?? seasons[0];
  const previousSeason = seasons.find((candidate) => candidate < activeSeason) ?? null;

  return readThrough(cacheKeys.dashboardSummary(activeSeason), TTL.DASHBOARD, async () => {
    const enriched = enrichReadings(allMetrics, nodes, buckets);
    const current = enriched.filter((row) => row.season === activeSeason);
    const previous = previousSeason
      ? enriched.filter((row) => row.season === previousSeason)
      : [];

    const currentLogs = logs.filter((log) => seasonOf(log.Collected_At) === activeSeason);
    const previousLogs = previousSeason
      ? logs.filter((log) => seasonOf(log.Collected_At) === previousSeason)
      : [];

    const avgSugar = average(current, 'Sugar_Percent');
    const prevAvgSugar = average(previous, 'Sugar_Percent');
    const avgNet = average(current, 'netWeight');
    const collected = totalCollected(currentLogs);

    // Shelf life and spoilage are per-node, so evaluate each node's own
    // recent readings rather than averaging across the whole sugarbush.
    const perNode = nodes.map((node) => {
      const readings = current.filter((row) => row.NodeID === node.NodeID);
      return {
        node,
        spoilage: assessSpoilage(readings),
        shelfLife: shelfLifeFromReadings(readings),
      };
    });

    const atRisk = perNode.filter(
      (entry) =>
        entry.spoilage.risk === SpoilageRisk.ELEVATED ||
        entry.spoilage.risk === SpoilageRisk.CRITICAL,
    );

    const shelfLifeHours = perNode
      .map((entry) => entry.shelfLife?.hours)
      .filter((value) => value != null);

    return {
      season: activeSeason,
      previousSeason,
      seasons,

      kpis: {
        averageSugar: avgSugar,
        averageSugarChange: percentChange(avgSugar, prevAvgSugar),
        averageNetWeight: avgNet,
        averageNetWeightChange: percentChange(avgNet, average(previous, 'netWeight')),
        totalCollectedGallons: collected,
        totalCollectedChange: percentChange(collected, totalCollected(previousLogs)),
        yieldEfficiency: yieldEfficiency(avgSugar),
        medianShelfLifeHours: shelfLifeHours.length
          ? [...shelfLifeHours].sort((a, b) => a - b)[Math.floor(shelfLifeHours.length / 2)]
          : null,
        readingCount: current.length,
        fullBuckets: current.filter((row) => row.isFull).length,
        nodesAtSpoilageRisk: atRisk.length,
      },

      series: {
        sugar: dailySeries(current, 'Sugar_Percent'),
        weight: dailySeries(current, 'netWeight'),
        temperature: dailySeries(current, 'Temperature'),
        collection: dailyTotals(currentLogs, 'Volume_Collected', { dateField: 'Collected_At' }),
      },

      // FR-013: year-over-year, re-indexed so seasons that started on
      // different dates line up on the x-axis.
      yearOverYear: {
        sugar: alignSeasonSeries(seasonComparisonSeries(enriched, 'Sugar_Percent')),
        weight: alignSeasonSeries(seasonComparisonSeries(enriched, 'netWeight')),
        seasons,
      },

      shelfLife: perNode
        .filter((entry) => entry.shelfLife)
        .map((entry) => ({
          nodeId: entry.node.NodeID,
          nodeName: entry.node.Node_Name,
          ...entry.shelfLife,
        }))
        .sort((a, b) => (a.hours ?? Infinity) - (b.hours ?? Infinity)),

      spoilage: atRisk.map((entry) => ({
        nodeId: entry.node.NodeID,
        nodeName: entry.node.Node_Name,
        ...entry.spoilage,
      })),

      health: healthSummary(nodes, gateways),
      openAlerts: alerts.filter((alert) => !alert.Is_Resolved).length,
    };
  });
}
