import { describe, expect, test } from 'vitest';
import { groupCollections } from '../src/business/collectionLogHistory';

const at1 = '2026-11-08T15:00:00.000Z';
const at2 = '2026-11-04T15:00:00.000Z';
const log = (LogID, NodeID, Collected_At, Volume_Collected, Quality_Notes = '[Test sample] Test collection round 1', Data_Mode = 'test') =>
  ({ LogID, NodeID, Collected_At, Volume_Collected, Quality_Notes, Data_Mode });

describe('collection history rounds', () => {
  test('trees collected at the same time form one round with a total', () => {
    const rounds = groupCollections([log(1, 22, at1, 2.46), log(2, 17, at1, 2.58), log(3, 21, at2, 2.34, 'Round 2')]);
    expect(rounds).toHaveLength(2);
    expect(rounds[0]).toMatchObject({ at: at1, totalGallons: 5.04, isTest: true, note: 'Test collection round 1', unrecorded: 0 });
    expect(rounds[0].trees.map((tree) => tree.name)).toEqual(['Node 17', 'Node 22']);
    expect(rounds[1].note).toBe('Round 2');
  });

  test('uses tree names when known, sorted naturally', () => {
    const nodes = new Map([[17, { Node_Name: 'Red Barn 10' }], [22, { Node_Name: 'Red Barn 2' }]]);
    const [round] = groupCollections([log(1, 17, at1, 1), log(2, 22, at1, 1)], nodes);
    expect(round.trees.map((tree) => tree.name)).toEqual(['Red Barn 2', 'Red Barn 10']);
  });

  test('a missing volume is counted apart and not added', () => {
    const [round] = groupCollections([log(1, 1, at1, null), log(2, 2, at1, 1.5)]);
    expect(round).toMatchObject({ totalGallons: 1.5, unrecorded: 1 });
    expect(round.trees.find((tree) => tree.nodeId === 1).gallons).toBeNull();
  });

  test('different notes in one round are not merged into a header', () => {
    const [round] = groupCollections([log(1, 1, at1, 1, 'Cloudy', 'production'), log(2, 2, at1, 1, 'Ice in bucket', 'production')]);
    expect(round).toMatchObject({ note: '', isTest: false });
  });
});
