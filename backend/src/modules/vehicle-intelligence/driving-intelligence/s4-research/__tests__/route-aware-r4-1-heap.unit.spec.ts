import { RouteQueryMinHeap } from '../route-query-min-heap';
import { buildDirectedCarRoutingGraph } from '../osm-directed-routing-graph';
import type { ResearchOsmWay } from '../contracts';
import {
  clearRouteQueryCache,
  compareSearchState,
  queryRouteBetweenProjectionsWithQueue,
} from '../route-query';
import type { WaySegmentProjection } from '../route-segment-projection';
import type { S4RouteAwareResearchConfig } from '../route-aware-config';
import { DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG } from '../route-aware-config';

type St = {
  key: string;
  nodeId: number;
  incomingWayId: number | null;
  costM: number;
  prevKey: string | null;
  incomingEdge: null;
  directionChanges: number;
  turnUnknown: boolean;
};

function st(costM: number, nodeId: number, incomingWayId: number | null): St {
  return {
    key: `${nodeId}:${incomingWayId ?? -1}`,
    nodeId,
    incomingWayId,
    costM,
    prevKey: null,
    incomingEdge: null,
    directionChanges: 0,
    turnUnknown: false,
  };
}

function rw(id: number, nodes: Array<{ lat: number; lon: number }>, tags?: Record<string, string>): ResearchOsmWay {
  return {
    osmWayId: id,
    nodes,
    tags: { highway: 'residential', ...tags },
    highway: 'residential',
    maxspeed: null,
    oneway: tags?.oneway ?? null,
  };
}

function overpass(
  specs: Array<{ id: number; nodeIds: number[]; geom: Array<{ lat: number; lon: number }> }>,
): { elements: Array<Record<string, unknown>> } {
  const elements: Array<Record<string, unknown>> = [];
  for (const s of specs) {
    for (let i = 0; i < s.nodeIds.length; i++) {
      elements.push({
        type: 'node',
        id: s.nodeIds[i],
        lat: s.geom[i].lat,
        lon: s.geom[i].lon,
        tags: {},
      });
    }
    elements.push({
      type: 'way',
      id: s.id,
      nodes: s.nodeIds,
      geometry: s.geom,
      tags: { highway: 'residential' },
    });
  }
  return { elements };
}

function proj(
  wayId: number,
  segmentIndex: number,
  fraction: number,
  startNodeId: number,
  endNodeId: number,
): WaySegmentProjection {
  return {
    wayId,
    segmentIndex,
    fractionAlongSegment: fraction,
    distanceToWayM: 0,
    lat: 51.3,
    lon: 9.5,
    startNodeId,
    endNodeId,
  };
}

function assertRouteParity(
  graph: ReturnType<typeof buildDirectedCarRoutingGraph>,
  from: WaySegmentProjection,
  to: WaySegmentProjection,
  config?: S4RouteAwareResearchConfig,
): void {
  clearRouteQueryCache(graph);
  const heap = queryRouteBetweenProjectionsWithQueue(graph, from, to, config, 'heap');
  clearRouteQueryCache(graph);
  const sort = queryRouteBetweenProjectionsWithQueue(graph, from, to, config, 'sort');
  expect(heap.status).toBe(sort.status);
  expect(heap.routeDistanceM).toBeCloseTo(sort.routeDistanceM, 9);
  expect(heap.nodePath).toEqual(sort.nodePath);
  expect(heap.waySegments).toEqual(sort.waySegments);
  expect(heap.turnRestrictionUnknown).toBe(sort.turnRestrictionUnknown);
}

describe('route-aware R4.1 comparator heap', () => {
  it('MinHeap pop order matches compareSearchState lexicographic order', () => {
    const heap = new RouteQueryMinHeap<St>(compareSearchState);
    const items = [
      st(10.001, 1, 100),
      st(10, 2_000_000_000, 50),
      st(10, 5, 200),
      st(10.0000000001, 3, 1),
      st(9.999, 9_999_999_999, 9_999_999_999),
    ];
    for (const x of items) heap.push(x);
    const popped: St[] = [];
    while (heap.size > 0) {
      const x = heap.pop()!;
      popped.push(x);
    }
    for (let i = 1; i < popped.length; i++) {
      expect(compareSearchState(popped[i - 1], popped[i])).toBeLessThanOrEqual(0);
    }
    expect(popped[0].costM).toBe(9.999);
    expect(popped[1].costM).toBe(10);
    expect(popped[1].nodeId).toBe(5);
    expect(popped[2].nodeId).toBe(2_000_000_000);
  });

  it('adversarial: lower cost with huge OSM node id wins over higher cost with tiny id', () => {
    const w1 = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const wHi = rw(2, [{ lat: 51.301, lon: 9.5 }, { lat: 51.301, lon: 9.502 }]);
    const wLo = rw(3, [{ lat: 51.301, lon: 9.5 }, { lat: 51.302, lon: 9.5 }]);
    const body = overpass([
      { id: 1, nodeIds: [1, 2], geom: w1.nodes },
      { id: 2, nodeIds: [2, 3_000_000_001], geom: wHi.nodes },
      { id: 3, nodeIds: [2, 4], geom: wLo.nodes },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [w1, wHi, wLo]);
    const from = proj(1, 0, 0.9, 1, 2);
    const to = proj(3, 0, 0.5, 2, 4);
    assertRouteParity(graph, from, to);
  });

  it('adversarial: equal cost tie-break on nodeId then incomingWayId', () => {
    const wA = rw(10, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const wB = rw(20, [{ lat: 51.3, lon: 9.501 }, { lat: 51.301, lon: 9.501 }]);
    const wBridge = rw(30, [{ lat: 51.301, lon: 9.5 }, { lat: 51.301, lon: 9.501 }]);
    const body = overpass([
      { id: 10, nodeIds: [100, 200], geom: wA.nodes },
      { id: 20, nodeIds: [300, 400], geom: wB.nodes },
      { id: 30, nodeIds: [200, 300], geom: wBridge.nodes },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [wA, wB, wBridge]);
    const from = proj(10, 0, 0.5, 100, 200);
    const to = proj(20, 0, 0.5, 300, 400);
    assertRouteParity(graph, from, to);
  });

  it('adversarial: nearly equal floating costs and max expansion boundary', () => {
    const nodes = [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }];
    const w = rw(1, nodes);
    const body = overpass([{ id: 1, nodeIds: [1, 2], geom: nodes }]);
    const graph = buildDirectedCarRoutingGraph(body, [w]);
    const from = proj(1, 0, 0.1000000001, 1, 2);
    const to = proj(1, 0, 0.1000000002, 1, 2);
    const tight: S4RouteAwareResearchConfig = {
      ...DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG,
      maxRoutingExpansions: 2,
      maxRouteDistanceM: 500,
    };
    assertRouteParity(graph, from, to, tight);
  });
});
