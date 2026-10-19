import { buildWayAdjacency, graphReachable } from '../osm-parse';
import type { ResearchOsmWay } from '../contracts';

function rw(id: number, nodes: Array<{ lat: number; lon: number }>): ResearchOsmWay {
  return {
    osmWayId: id,
    nodes,
    tags: { highway: 'residential' },
    highway: 'residential',
    maxspeed: null,
    oneway: null,
  };
}

/** Mirrors harness graphConflicts — must pass adj into reach(). */
function graphConflicts(
  rows: Array<{ wayId: number | null }>,
  adj: Map<number, Set<number>>,
  reach: (adj: Map<number, Set<number>>, a: number | null, b: number | null) => boolean,
): number {
  let n = 0;
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].wayId;
    const cur = rows[i].wayId;
    if (prev != null && cur != null && prev !== cur && !reach(adj, prev, cur)) n += 1;
  }
  return n;
}

describe('graphConflicts callback (harness regression)', () => {
  it('does not flag a valid adjacent way transition', () => {
    const w1 = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const w2 = rw(2, [{ lat: 51.301, lon: 9.5 }, { lat: 51.301, lon: 9.5002 }]);
    const adj = buildWayAdjacency([w1, w2]);
    expect(graphReachable(adj, 1, 2)).toBe(true);
    const track = [{ wayId: 1 }, { wayId: 2 }];
    expect(graphConflicts(track, adj, graphReachable)).toBe(0);
  });

  it('flags a non-adjacent way switch', () => {
    const w1 = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const w2 = rw(2, [{ lat: 51.32, lon: 9.52 }, { lat: 51.321, lon: 9.52 }]);
    const adj = buildWayAdjacency([w1, w2]);
    expect(graphConflicts([{ wayId: 1 }, { wayId: 2 }], adj, graphReachable)).toBe(1);
  });
});
