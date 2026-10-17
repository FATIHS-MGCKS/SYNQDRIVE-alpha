import { detectGraphTransitionConflicts } from '../road-matching-pipeline';
import { buildWayAdjacency, graphReachable } from '../osm-parse';
import type { ResearchOsmWay } from '../contracts';

function straightWay(id: number, lat0: number, lon0: number, steps: number): ResearchOsmWay {
  const nodes = [];
  for (let i = 0; i < steps; i++) nodes.push({ lat: lat0 + i * 0.0001, lon: lon0 });
  return {
    osmWayId: id,
    nodes,
    tags: { highway: 'residential' },
    highway: 'residential',
    maxspeed: null,
    oneway: null,
  };
}

describe('detectGraphTransitionConflicts', () => {
  it('reports exact conflict for non-adjacent Viterbi way hop', () => {
    const ways = [straightWay(1, 51.3, 9.5, 5), straightWay(2, 51.31, 9.51, 5)];
    const conflicts = detectGraphTransitionConflicts(
      [
        { bucketLabelUtc: '2026-01-01T00:00:00Z', wayId: 1 },
        { bucketLabelUtc: '2026-01-01T00:00:01Z', wayId: 2 },
      ],
      ways,
    );
    expect(conflicts).toEqual([
      {
        bucketLabelUtc: '2026-01-01T00:00:01Z',
        prevBucketLabelUtc: '2026-01-01T00:00:00Z',
        prevWayId: 1,
        curWayId: 2,
        graphReachable: false,
        reviewNote: 'Non-adjacent Viterbi way hop — topology conflict (not accuracy proof).',
      },
    ]);
  });

  it('does not claim adjacency for spatially overlapping but unshared-node ways (bridge limitation)', () => {
    const lower = straightWay(10, 51.3, 9.5, 3);
    const upper = {
      ...straightWay(11, 51.3, 9.5, 3),
      osmWayId: 11,
      nodes: lower.nodes.map((n) => ({ ...n })),
    };
    const adj = buildWayAdjacency([lower, upper]);
    expect(graphReachable(adj, 10, 11)).toBe(true);
    const separated = {
      ...upper,
      osmWayId: 12,
      nodes: upper.nodes.map((n) => ({ lat: n.lat + 0.00001, lon: n.lon + 0.00001 })),
    };
    const adj2 = buildWayAdjacency([lower, separated]);
    expect(graphReachable(adj2, 10, 12)).toBe(false);
  });
});
