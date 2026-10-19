import {
  DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  buildStrictNodeIdWayAdjacency,
  buildViterbiMatches,
  buildViterbiMatchesBacktrackR1,
  classifyDirectedTransition,
  headingsFromBaseline,
  buildBaselineMatches,
  buildWayAdjacency,
  graphReachableNodeId,
  type ResearchGpsBucket,
  type ResearchOsmWay,
} from '../index';

function overpassFromWays(
  specs: Array<{ id: number; nodeIds: number[]; geom: Array<{ lat: number; lon: number }>; tags?: Record<string, string> }>,
): { elements: Array<Record<string, unknown>> } {
  const elements: Array<Record<string, unknown>> = [];
  const nodeSet = new Set<number>();
  for (const s of specs) for (const n of s.nodeIds) nodeSet.add(n);
  for (const nid of nodeSet) {
    const w = specs.find((s) => s.nodeIds.includes(nid))!;
    const idx = w.nodeIds.indexOf(nid);
    elements.push({ type: 'node', id: nid, lat: w.geom[idx].lat, lon: w.geom[idx].lon, tags: {} });
  }
  for (const s of specs) {
    elements.push({
      type: 'way',
      id: s.id,
      nodes: s.nodeIds,
      geometry: s.geom,
      tags: s.tags ?? { highway: 'residential' },
    });
  }
  return { elements };
}

function rw(id: number, nodes: Array<{ lat: number; lon: number }>, extra?: Partial<ResearchOsmWay>): ResearchOsmWay {
  return {
    osmWayId: id,
    nodes,
    tags: { highway: 'residential' },
    highway: 'residential',
    maxspeed: null,
    oneway: null,
    ...extra,
  };
}

function bucket(i: number, lat: number, lon: number): ResearchGpsBucket {
  return {
    bucketLabelUtc: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
    availability: 'PRESENT',
    latitude: lat,
    longitude: lon,
    l3SpeedKmh: 30,
  };
}

describe('osm node-id topology R1', () => {
  it('1: bridge stack — rounded connects, strict node-id does not', () => {
    const shared = { lat: 51.3, lon: 9.5 };
    const wGround = rw(1, [shared, { lat: 51.301, lon: 9.5 }]);
    const wBridge = rw(2, [{ lat: 51.3000004, lon: 9.5000004 }, { lat: 51.301, lon: 9.5 }], {
      tags: { highway: 'residential', bridge: 'yes', layer: '1' },
    });
    const rounded = buildWayAdjacency([wGround, wBridge]);
    expect(rounded.get(1)?.has(2)).toBe(true);
    const body = overpassFromWays([
      { id: 1, nodeIds: [10, 11], geom: [shared, { lat: 51.301, lon: 9.5 }] },
      {
        id: 2,
        nodeIds: [20, 21],
        geom: [{ lat: 51.3000004, lon: 9.5000004 }, { lat: 51.301, lon: 9.5 }],
        tags: { highway: 'residential', bridge: 'yes', layer: '1' },
      },
    ]);
    const strict = buildStrictNodeIdWayAdjacency(body, [wGround, wBridge], rounded);
    expect(strict.undirectedAdj.get(1)?.has(2)).toBeFalsy();
  });

  it('2: true shared OSM node connects under strict graph', () => {
    const j = { lat: 51.3, lon: 9.5 };
    const wA = rw(100, [j, { lat: 51.301, lon: 9.5 }]);
    const wB = rw(101, [j, { lat: 51.3, lon: 9.5001 }]);
    const body = overpassFromWays([
      { id: 100, nodeIds: [1, 2], geom: [j, { lat: 51.301, lon: 9.5 }] },
      { id: 101, nodeIds: [1, 3], geom: [j, { lat: 51.3, lon: 9.5001 }] },
    ]);
    const strict = buildStrictNodeIdWayAdjacency(body, [wA, wB]);
    expect(graphReachableNodeId(strict.undirectedAdj, 100, 101)).toBe(true);
  });

  it('3: same coordinate different node id — rounded-only edge', () => {
    const p = { lat: 51.3, lon: 9.5 };
    const wA = rw(1, [p, { lat: 51.301, lon: 9.5 }]);
    const wB = rw(2, [{ lat: 51.3000001, lon: 9.5000001 }, { lat: 51.301, lon: 9.5 }]);
    const rounded = buildWayAdjacency([wA, wB]);
    const body = overpassFromWays([
      { id: 1, nodeIds: [10, 11], geom: [p, { lat: 51.301, lon: 9.5 }] },
      { id: 2, nodeIds: [20, 11], geom: [{ lat: 51.3000001, lon: 9.5000001 }, { lat: 51.301, lon: 9.5 }] },
    ]);
    const strict = buildStrictNodeIdWayAdjacency(body, [wA, wB], rounded);
    expect(rounded.get(1)?.has(2)).toBe(true);
    expect(strict.undirectedAdj.get(1)?.has(2)).toBe(true); // shares node 11 in overpass
  });

  it('4: allowed oneway junction — directional status unknown not forbidden', () => {
    const body = overpassFromWays([
      { id: 1, nodeIds: [1, 2], geom: [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }], tags: { highway: 'residential', oneway: 'yes' } },
      { id: 2, nodeIds: [2, 3], geom: [{ lat: 51.301, lon: 9.5 }, { lat: 51.301, lon: 9.5002 }], tags: { highway: 'residential' } },
    ]);
    const a = body.elements.find((e) => e.type === 'way' && e.id === 1) as {
      tags: Record<string, string>;
      nodes: number[];
    };
    const b = body.elements.find((e) => e.type === 'way' && e.id === 2) as {
      tags: Record<string, string>;
      nodes: number[];
    };
    const rawA = { osmId: 1, nodeIds: a.nodes, tags: a.tags, geometry: [] };
    const rawB = { osmId: 2, nodeIds: b.nodes, tags: b.tags, geometry: [] };
    expect(classifyDirectedTransition(rawA, rawB, [2])).toBe('ONEWAY_DIRECTION_UNKNOWN');
  });

  it('5: no shared node — clearly forbidden directed transition', () => {
    const rawA = { osmId: 1, nodeIds: [1, 2], tags: {}, geometry: [] };
    const rawB = { osmId: 2, nodeIds: [3, 4], tags: {}, geometry: [] };
    expect(classifyDirectedTransition(rawA, rawB, [])).toBe('CLEARLY_FORBIDDEN');
  });

  it('6: different layer tags still share node id in strict graph', () => {
    const j = { lat: 51.3, lon: 9.5 };
    const wA = rw(1, [j, { lat: 51.301, lon: 9.5 }], { tags: { highway: 'residential', layer: '0' } });
    const wB = rw(2, [j, { lat: 51.301, lon: 9.5001 }], { tags: { highway: 'residential', layer: '1' } });
    const body = overpassFromWays([
      { id: 1, nodeIds: [1, 2], geom: [j, { lat: 51.301, lon: 9.5 }], tags: { highway: 'residential', layer: '0' } },
      { id: 2, nodeIds: [1, 3], geom: [j, { lat: 51.301, lon: 9.5001 }], tags: { highway: 'residential', layer: '1' } },
    ]);
    const strict = buildStrictNodeIdWayAdjacency(body, [wA, wB]);
    expect(strict.undirectedAdj.get(1)?.has(2)).toBe(true);
  });

  it('7: missing node ids on corridor way surfaces uncertainty', () => {
    const w = rw(9, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const strict = buildStrictNodeIdWayAdjacency({ elements: [] }, [w]);
    expect(strict.missingNodeIdWayIds).toContain(9);
  });

  it('8: GPS gap resets backtrack segments with node-id adjacency', () => {
    const ways = [rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.305, lon: 9.5 }])];
    const buckets: ResearchGpsBucket[] = [
      bucket(0, 51.3005, 9.5),
      { bucketLabelUtc: '2026-01-01T00:00:01Z', availability: 'ROW_ABSENT', latitude: null, longitude: null },
      bucket(2, 51.3015, 9.5),
    ];
    const base = buildBaselineMatches(buckets, { ways, signalNodes: [], confirmedJunctions: [] }, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
    const body = overpassFromWays([{ id: 1, nodeIds: [1, 2], geom: ways[0].nodes }]);
    const strict = buildStrictNodeIdWayAdjacency(body, ways);
    const back = buildViterbiMatchesBacktrackR1(
      buckets,
      ways,
      headingsFromBaseline(base),
      DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
      { wayAdjacency: strict.undirectedAdj },
    );
    expect(back.segments.length).toBe(2);
  });

  it('9: four-way deterministic — forward node-id matches on repeat', () => {
    const ways = [rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.31, lon: 9.5 }])];
    const buckets = [0, 1, 2].map((i) => bucket(i, 51.3 + i * 0.003, 9.5));
    const base = buildBaselineMatches(buckets, { ways, signalNodes: [], confirmedJunctions: [] }, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
    const h = headingsFromBaseline(base);
    const body = overpassFromWays([{ id: 1, nodeIds: [1, 2], geom: ways[0].nodes }]);
    const strict = buildStrictNodeIdWayAdjacency(body, ways);
    const a = buildViterbiMatches(buckets, ways, h, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG, {
      wayAdjacency: strict.undirectedAdj,
    });
    const b = buildViterbiMatches(buckets, ways, h, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG, {
      wayAdjacency: strict.undirectedAdj,
    });
    expect(a.map((r) => r.osmWayId)).toEqual(b.map((r) => r.osmWayId));
  });
});
