import {
  DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG,
  buildDirectedCarRoutingGraph,
  buildViterbiMatchesRouteAwareR1,
  clearRouteQueryCache,
  computeRouteAwareTransitionCost,
  projectBucketOntoWay,
  queryRouteBetweenProjections,
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
    tags: { highway: 'residential', ...(extra?.tags ?? {}) },
    highway: 'residential',
    maxspeed: null,
    oneway: extra?.oneway ?? null,
  };
}

function bucket(label: string, lat: number, lon: number, l3?: number): ResearchGpsBucket {
  return {
    bucketLabelUtc: label,
    availability: 'PRESENT',
    latitude: lat,
    longitude: lon,
    l3SpeedKmh: l3 ?? 40,
  };
}

describe('route-aware Viterbi R1 synthetic', () => {
  beforeEach(() => clearRouteQueryCache());

  it('1: parallel roads without connection — route not found', () => {
    const w1 = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const w2 = rw(2, [{ lat: 51.3, lon: 9.502 }, { lat: 51.301, lon: 9.502 }]);
    const body = overpassFromWays([
      { id: 1, nodeIds: [1, 2], geom: w1.nodes },
      { id: 2, nodeIds: [3, 4], geom: w2.nodes },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [w1, w2]);
    const b0 = bucket('2026-10-16T10:00:00Z', 51.3005, 9.5);
    const b1 = bucket('2026-10-16T10:00:10Z', 51.3005, 9.502);
    const cost = computeRouteAwareTransitionCost(graph, b0, b1, w1, w2, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
    expect(cost.status).toBe('ROUTE_NOT_FOUND_IN_EXTRACT');
    expect(cost.statusPenalty).toBeGreaterThan(0);
  });

  it('2: parallel roads with connecting ramp', () => {
    const w1 = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.3005, lon: 9.5 }]);
    const w2 = rw(2, [{ lat: 51.3005, lon: 9.502 }, { lat: 51.301, lon: 9.502 }]);
    const ramp = rw(3, [{ lat: 51.3005, lon: 9.5 }, { lat: 51.3005, lon: 9.502 }]);
    const body = overpassFromWays([
      { id: 1, nodeIds: [1, 10], geom: w1.nodes },
      { id: 2, nodeIds: [11, 4], geom: w2.nodes },
      { id: 3, nodeIds: [10, 11], geom: ramp.nodes },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [w1, w2, ramp]);
    const b0 = bucket('2026-10-16T10:00:00Z', 51.3005, 9.5);
    const b1 = bucket('2026-10-16T10:00:15Z', 51.3005, 9.502);
    const cost = computeRouteAwareTransitionCost(graph, b0, b1, w1, w2, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
    expect(cost.status).toBe('CONNECTED_AND_DIRECTION_ALLOWED');
    expect(cost.routeDistanceM).toBeGreaterThan(0);
  });

  it('3: oneway allowed direction', () => {
    const w = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }], { tags: { highway: 'residential', oneway: 'yes' } });
    const body = overpassFromWays([{ id: 1, nodeIds: [1, 2], geom: w.nodes, tags: { highway: 'residential', oneway: 'yes' } }]);
    const graph = buildDirectedCarRoutingGraph(body, [w]);
    const b0 = bucket('2026-10-16T10:00:00Z', 51.3002, 9.5);
    const b1 = bucket('2026-10-16T10:00:10Z', 51.3008, 9.5);
    const cost = computeRouteAwareTransitionCost(graph, b0, b1, w, w, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
    expect(cost.status).toBe('CONNECTED_AND_DIRECTION_ALLOWED');
  });

  it('4: oneway against travel direction forbidden', () => {
    const w = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }], { tags: { highway: 'residential', oneway: 'yes' } });
    const body = overpassFromWays([{ id: 1, nodeIds: [1, 2], geom: w.nodes, tags: { highway: 'residential', oneway: 'yes' } }]);
    const graph = buildDirectedCarRoutingGraph(body, [w]);
    const b0 = bucket('2026-10-16T10:00:00Z', 51.3008, 9.5);
    const b1 = bucket('2026-10-16T10:00:10Z', 51.3002, 9.5);
    const cost = computeRouteAwareTransitionCost(graph, b0, b1, w, w, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
    expect(cost.status).toBe('DIRECTION_FORBIDDEN');
  });

  it('5: junction with multiple exits may mark turn restriction unknown', () => {
    const a = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const b = rw(2, [{ lat: 51.301, lon: 9.5 }, { lat: 51.301, lon: 9.502 }]);
    const c = rw(3, [{ lat: 51.301, lon: 9.5 }, { lat: 51.302, lon: 9.5 }]);
    const body = overpassFromWays([
      { id: 1, nodeIds: [1, 2], geom: a.nodes },
      { id: 2, nodeIds: [2, 3], geom: b.nodes },
      { id: 3, nodeIds: [2, 4], geom: c.nodes },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [a, b, c]);
    const p0 = projectBucketOntoWay(bucket('t0', 51.3005, 9.5), a, [1, 2])!;
    const p1 = projectBucketOntoWay(bucket('t1', 51.3012, 9.501), b, [2, 3])!;
    const route = queryRouteBetweenProjections(graph, p0, p1);
    expect(route.status).toBe('TURN_RESTRICTION_UNKNOWN');
  });

  it('6: roundabout oneway direction', () => {
    const rb = rw(10, [
      { lat: 51.3, lon: 9.5 },
      { lat: 51.3005, lon: 9.5005 },
      { lat: 51.3, lon: 9.501 },
      { lat: 51.2995, lon: 9.5005 },
      { lat: 51.3, lon: 9.5 },
    ], { tags: { highway: 'mini_roundabout', junction: 'roundabout', oneway: 'yes' } });
    const body = overpassFromWays([
      { id: 10, nodeIds: [1, 2, 3, 4, 1], geom: rb.nodes, tags: { highway: 'mini_roundabout', junction: 'roundabout', oneway: 'yes' } },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [rb]);
    const b0 = bucket('2026-10-16T10:00:00Z', 51.3001, 9.5003);
    const b1 = bucket('2026-10-16T10:00:05Z', 51.2999, 9.5007);
    const cost = computeRouteAwareTransitionCost(graph, b0, b1, rb, rb, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
    expect([
      'CONNECTED_AND_DIRECTION_ALLOWED',
      'TURN_RESTRICTION_UNKNOWN',
      'ROUTE_NOT_FOUND_IN_EXTRACT',
    ]).toContain(cost.status);
  });

  it('7: bridge layer without shared node — no route', () => {
    const ground = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const bridge = rw(2, [{ lat: 51.3005, lon: 9.4998 }, { lat: 51.3005, lon: 9.5002 }], {
      tags: { highway: 'residential', bridge: 'yes', layer: '1' },
    });
    const body = overpassFromWays([
      { id: 1, nodeIds: [1, 2], geom: ground.nodes },
      { id: 2, nodeIds: [3, 4], geom: bridge.nodes, tags: { highway: 'residential', bridge: 'yes', layer: '1' } },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [ground, bridge]);
    const cost = computeRouteAwareTransitionCost(
      graph,
      bucket('t0', 51.3005, 9.5),
      bucket('t1', 51.3005, 9.4999),
      ground,
      bridge,
      DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    );
    expect(cost.status).toBe('ROUTE_NOT_FOUND_IN_EXTRACT');
  });

  it('8: short air distance but long drive route', () => {
    const w1 = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const w2 = rw(2, [{ lat: 51.301, lon: 9.5 }, { lat: 51.301, lon: 9.503 }]);
    const w3 = rw(3, [{ lat: 51.301, lon: 9.503 }, { lat: 51.3, lon: 9.503 }]);
    const w4 = rw(4, [{ lat: 51.3, lon: 9.503 }, { lat: 51.3, lon: 9.5 }]);
    const body = overpassFromWays([
      { id: 1, nodeIds: [1, 2], geom: w1.nodes },
      { id: 2, nodeIds: [2, 3], geom: w2.nodes },
      { id: 3, nodeIds: [3, 4], geom: w3.nodes },
      { id: 4, nodeIds: [4, 1], geom: w4.nodes },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [w1, w2, w3, w4]);
    const cost = computeRouteAwareTransitionCost(
      graph,
      bucket('t0', 51.3002, 9.5001),
      bucket('t1', 51.3002, 9.5002),
      w1,
      w4,
      DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    );
    expect(cost.routeDistanceM).toBeGreaterThan(cost.airDistanceM * 3);
  });

  it('9: implausible speed within elapsed time', () => {
    const w = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.35, lon: 9.5 }]);
    const body = overpassFromWays([{ id: 1, nodeIds: [1, 2], geom: w.nodes }]);
    const graph = buildDirectedCarRoutingGraph(body, [w]);
    const cost = computeRouteAwareTransitionCost(
      graph,
      bucket('2026-10-16T10:00:00.000Z', 51.301, 9.5, 50),
      bucket('2026-10-16T10:00:01.000Z', 51.349, 9.5, 50),
      w,
      w,
      DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
      { ...DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG, l3SpeedSlackFactor: 1.2 },
    );
    expect(cost.timePlausibilityCost).toBeGreaterThan(0);
  });

  it('10: missing extract coverage → route not found (not marked allowed)', () => {
    const w1 = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const w2 = rw(2, [{ lat: 51.32, lon: 9.52 }, { lat: 51.321, lon: 9.52 }]);
    const body = overpassFromWays([
      { id: 1, nodeIds: [1, 2], geom: w1.nodes },
      { id: 2, nodeIds: [3, 4], geom: w2.nodes },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [w1, w2]);
    const cost = computeRouteAwareTransitionCost(
      graph,
      bucket('t0', 51.3005, 9.5),
      bucket('t1', 51.3205, 9.52),
      w1,
      w2,
      DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    );
    expect(cost.status).toBe('ROUTE_NOT_FOUND_IN_EXTRACT');
    expect(cost.total).toBeLessThan(DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG.penaltyDirectionForbidden);
  });

  it('11: GPS gap resets segment (UNKNOWN row)', () => {
    const w = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const body = overpassFromWays([{ id: 1, nodeIds: [1, 2], geom: w.nodes }]);
    const graph = buildDirectedCarRoutingGraph(body, [w]);
    const buckets: ResearchGpsBucket[] = [
      bucket('2026-10-16T10:00:00Z', 51.3005, 9.5),
      { bucketLabelUtc: '2026-10-16T10:00:05Z', availability: 'ROW_ABSENT', latitude: null, longitude: null },
      bucket('2026-10-16T10:00:10Z', 51.3008, 9.5),
    ];
    const run = buildViterbiMatchesRouteAwareR1(buckets, [w], [null, null, null], DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG, graph);
    expect(run.segments.length).toBe(2);
    expect(run.matches[1].outcome).toBe('UNKNOWN');
  });

  it('12: standstill jitter — low L3 does not over-penalize tiny moves', () => {
    const w = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const body = overpassFromWays([{ id: 1, nodeIds: [1, 2], geom: w.nodes }]);
    const graph = buildDirectedCarRoutingGraph(body, [w]);
    const cost = computeRouteAwareTransitionCost(
      graph,
      bucket('t0', 51.3005, 9.5, 0),
      bucket('t1', 51.3005005, 9.5000005, 0),
      w,
      w,
      DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    );
    expect(cost.timePlausibilityCost).toBe(0);
  });

  it('cache parity: identical queries hit cache', () => {
    const w1 = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const w2 = rw(2, [{ lat: 51.301, lon: 9.5 }, { lat: 51.301, lon: 9.502 }]);
    const body = overpassFromWays([
      { id: 1, nodeIds: [1, 2], geom: w1.nodes },
      { id: 2, nodeIds: [2, 3], geom: w2.nodes },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [w1, w2]);
    const b0 = bucket('t0', 51.3005, 9.5);
    const b1 = bucket('t1', 51.3012, 9.501);
    const a = computeRouteAwareTransitionCost(graph, b0, b1, w1, w2, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
    const b = computeRouteAwareTransitionCost(graph, b0, b1, w1, w2, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
    expect(a.routeDistanceM).toBe(b.routeDistanceM);
  });
});
