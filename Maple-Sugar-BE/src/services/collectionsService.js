/**
 * Records one collection as a single unit.
 *
 * A collection used to be two requests from the phone (a reading, then a note)
 * and never touched the collection log the dashboard totals from. A signal drop
 * between the two calls left half an entry, and a retry filed the reading
 * twice. Here the reading, the collection log, and the journal entry commit
 * together or not at all.
 */

import { invalid, notFound } from '../lib/ApiError.js';
import { COLLECTION_ALERT_TYPES, collectionTitle, collectionVolumeGallons, validateCollection } from '../business/collections.js';
import { transaction } from '../db/pool.js';
import { cacheNamespaces } from '../cache/cacheKeys.js';
import { invalidateNamespaces } from '../cache/redisCache.js';
import * as alertsRepository from '../repositories/alertsRepository.js';
import * as collectionLogsRepository from '../repositories/collectionLogsRepository.js';
import * as journalRepository from '../repositories/journalRepository.js';
import * as metricsRepository from '../repositories/metricsRepository.js';
import * as nodesRepository from '../repositories/nodesRepository.js';

/** Postgres unique_violation. Two uploads of one Client_Ref can race. */
const UNIQUE_VIOLATION = '23505';

function blankToNull(value) {
  return value === undefined || value === null || value === '' ? null : value;
}

export async function recordCollection(body, user) {
  const node = await nodesRepository.findNodeById(body.NodeID);
  if (!node) throw notFound('Tree');

  // The bucket comes from the tree, not the client: a phone cannot name a
  // different bucket than the one hanging on that tree.
  const [bucketId, tareWeight] = await Promise.all([
    nodesRepository.findBucketIdForNode(node.NodeID),
    nodesRepository.findTareWeightForNode(node.NodeID),
  ]);

  const input = {
    ...body,
    Weight: blankToNull(body.Weight),
    Sugar_Percent: blankToNull(body.Sugar_Percent),
  };

  const { errors, isValid } = validateCollection(input, { tareWeight });
  if (!isValid) throw invalid(Object.values(errors)[0] ?? 'Some fields need attention.', errors);

  const collectedAt = input.Collected_At ?? null;

  let saved;
  try {
    saved = await transaction(async (client) => {
      if (input.Client_Ref) {
        const existing = await journalRepository.findByClientRef(input.Client_Ref, client);
        if (existing) return { entry: existing, log: null, duplicate: true };
      }

      await metricsRepository.createMetric(
        {
          NodeID: node.NodeID,
          BucketID: bucketId,
          Recorded_By_UserID: user.UserID,
          Recorded_At: collectedAt,
          Weight: input.Weight,
          Sugar_Percent: input.Sugar_Percent,
          Ice_Present: input.Ice_Present,
        },
        client,
      );

      const log = await collectionLogsRepository.createCollectionLog(
        {
          NodeID: node.NodeID,
          BucketID: bucketId,
          // From the session, not the body: a collection is credited to whoever did it.
          UserID: user.UserID,
          Collected_At: collectedAt,
          Volume_Collected: collectionVolumeGallons(input.Weight, tareWeight),
          Quality_Notes: input.Notes,
        },
        client,
      );

      const entry = await journalRepository.createEntry(
        {
          UserID: user.UserID,
          NodeID: node.NodeID,
          BucketID: bucketId,
          Collected_At: collectedAt,
          Title: collectionTitle(node.Node_Name),
          Process_Notes: input.Notes,
          Weight: input.Weight,
          Sugar_Percent: input.Sugar_Percent,
          Ice_Present: input.Ice_Present,
          Round_Label: blankToNull(input.Round_Label),
          Client_Ref: input.Client_Ref ?? null,
        },
        client,
      );

      return { entry, log, duplicate: false };
    });
  } catch (error) {
    if (error?.code !== UNIQUE_VIOLATION || !input.Client_Ref) throw error;
    // Another request with this reference committed first; hand back its entry.
    const entry = await journalRepository.findByClientRef(input.Client_Ref);
    if (!entry) throw error;
    return { Entry: entry, Log: null, Duplicate: true };
  }

  if (!saved.duplicate) {
    // Nothing clears a full-bucket alert when the bucket is emptied by hand.
    // Left open, it would escalate to every admin about a bucket that is empty.
    await alertsRepository.resolveOpenByTypes(node.NodeID, COLLECTION_ALERT_TYPES);
    await invalidateNamespaces([
      cacheNamespaces.METRICS,
      cacheNamespaces.COLLECTION_LOGS,
      cacheNamespaces.DASHBOARD,
      cacheNamespaces.ALERTS,
      cacheNamespaces.NODES,
    ]);
  }

  return { Entry: saved.entry, Log: saved.log, Duplicate: saved.duplicate };
}
