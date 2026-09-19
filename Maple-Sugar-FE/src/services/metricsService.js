import * as bucketsRepository from '../data/repositories/bucketsRepository';
import * as metricsRepository from '../data/repositories/metricsRepository';
import * as nodesRepository from '../data/repositories/nodesRepository';
import { seasonOf, semesterOf } from '../business/aggregation';
import { classifyReading, sapToSyrupRatio } from '../business/sugarContent';
import { riskFromTemperature } from '../business/spoilage';
import {
  fillPercent,
  gallonsFromWeight,
  isFull,
  netWeight,
  waterRemovalFraction,
  yieldEfficiency,
} from '../business/yieldMetrics';

/**
 * Joins METRICS to its NODE and BUCKET and decorates each row with the
 * derived values the UI needs. The grid and the charts share this shape so a
 * number shown in one place cannot disagree with the other.
 */

export function enrichReadings(metrics, nodes, buckets) {
  const nodeById = new Map(nodes.map((node) => [node.NodeID, node]));
  const bucketById = new Map(buckets.map((bucket) => [bucket.BucketID, bucket]));

  return metrics.map((row) => {
    const node = nodeById.get(row.NodeID);
    const bucket = bucketById.get(row.BucketID);
    const tare = bucket?.Tare_Weight ?? 0;
    const net = netWeight(row.Weight, tare);

    return {
      ...row,
      id: row.MetricID,
      nodeName: node?.Node_Name ?? `Node ${row.NodeID}`,
      stand: node?.Stand ?? null,
      barcode: bucket?.Barcode_ID ?? null,
      tareWeight: tare,
      netWeight: net,
      gallons: gallonsFromWeight(net),
      fillPercent: fillPercent(row.Weight, tare),
      isFull: isFull(row.Weight, tare),
      spoilageRisk: riskFromTemperature(row.Temperature),
      sugarClass: classifyReading(row.Sugar_Percent),
      sapToSyrupRatio: sapToSyrupRatio(row.Sugar_Percent),
      yieldEfficiency: yieldEfficiency(row.Sugar_Percent),
      waterRemoval: waterRemovalFraction(row.Sugar_Percent),
      season: seasonOf(row.Recorded_At),
      semester: semesterOf(row.Recorded_At),
      // Null Recorded_By_UserID means the ESP32 sent it unattended.
      source: row.Recorded_By_UserID == null ? 'Sensor' : 'Manual',
    };
  });
}

/** All readings matching a filter, enriched and newest first. */
export async function getReadings(filters = {}) {
  const [metrics, nodes, buckets] = await Promise.all([
    metricsRepository.listMetrics(filters),
    nodesRepository.listNodes(),
    bucketsRepository.listBuckets(),
  ]);

  return enrichReadings(metrics, nodes, buckets).sort(
    (a, b) => new Date(b.Recorded_At) - new Date(a.Recorded_At),
  );
}

export async function getReadingsForNode(nodeId) {
  const [metrics, nodes, buckets] = await Promise.all([
    metricsRepository.listMetricsForNode(nodeId),
    nodesRepository.listNodes(),
    bucketsRepository.listBuckets(),
  ]);

  return enrichReadings(metrics, nodes, buckets).sort(
    (a, b) => new Date(a.Recorded_At) - new Date(b.Recorded_At),
  );
}

/** Tree list for the record-data selector, with the bucket already resolved. */
export async function getRecordingTargets() {
  const [nodes, buckets] = await Promise.all([
    nodesRepository.listNodes(),
    bucketsRepository.listBuckets(),
  ]);

  return nodes
    .map((node) => {
      const bucket = buckets.find((candidate) => candidate.NodeID === node.NodeID);
      return {
        nodeId: node.NodeID,
        label: node.Node_Name,
        stand: node.Stand,
        bucketId: bucket?.BucketID ?? null,
        barcode: bucket?.Barcode_ID ?? null,
        tareWeight: bucket?.Tare_Weight ?? null,
        isOffline: node.Status_Code === 0,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function submitReading(reading) {
  return metricsRepository.createMetric(reading);
}

/** FR-046: lets a user correct a value that disagrees with the sensor. */
export function correctReading(metricId, changes) {
  return metricsRepository.updateMetric(metricId, changes);
}
