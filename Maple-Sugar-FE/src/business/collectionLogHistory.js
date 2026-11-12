/**
 * Groups collection-log rows into rounds for the history card: every tree
 * emptied at the same moment is one round, with its total volume and the note
 * shown once instead of on every tree.
 */

const TEST_PREFIX = /^\[Test sample\]\s*/;

function cleanNote(note) {
  return String(note ?? '').replace(TEST_PREFIX, '').trim();
}

function roundGallons(value) {
  return Math.round(value * 100) / 100;
}

/**
 * @param {Array} logs newest first, as GET /collection-logs returns them
 * @param {Map<number, {Node_Name?: string}>} nodesById optional, for tree names
 */
export function groupCollections(logs, nodesById = new Map()) {
  const groups = [];
  const byTime = new Map();

  for (const log of logs) {
    const key = log.Collected_At ?? `log-${log.LogID}`;
    let group = byTime.get(key);
    if (!group) {
      group = { key, at: log.Collected_At, trees: [], notes: new Set(), isTest: false, totalGallons: 0, unrecorded: 0 };
      byTime.set(key, group);
      groups.push(group);
    }
    const note = cleanNote(log.Quality_Notes);
    if (note) group.notes.add(note);
    if (log.Data_Mode === 'test' || TEST_PREFIX.test(String(log.Quality_Notes ?? ''))) group.isTest = true;
    if (log.Volume_Collected == null) group.unrecorded += 1;
    else group.totalGallons += Number(log.Volume_Collected);
    group.trees.push({
      id: log.LogID,
      nodeId: log.NodeID,
      name: nodesById.get(log.NodeID)?.Node_Name ?? (log.NodeID != null ? `Node ${log.NodeID}` : 'No tree'),
      gallons: log.Volume_Collected == null ? null : Number(log.Volume_Collected),
    });
  }

  return groups.map(({ notes, totalGallons, trees, ...group }) => ({
    ...group,
    // One shared note heads the round. Different notes stay with their trees.
    note: notes.size === 1 ? [...notes][0] : '',
    trees: trees.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    totalGallons: roundGallons(totalGallons),
  }));
}
