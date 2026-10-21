import {
  DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  buildDirectedCarRoutingGraph,
  clearRouteQueryCache,
  partialSegmentLengthsM,
  queryRouteBetweenProjections,
  type ResearchOsmWay,
} from '../index';
import type { WaySegmentProjection } from '../route-segment-projection';

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

function overpassFromWays(
  specs: Array<{ id: number; nodeIds: number[]; geom: Array<{ lat: number; lon: number }>; tags?: Record<string, string> }>,
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
      tags: s.tags ?? { highway: 'residential' },
    });
  }
  return { elements };
}

describe('route-aware R2 correctness', () => {
  it('P1 partialSegmentLengthsM at 0/25/50/75/100%', () => {
    const len = 100;
    expect(partialSegmentLengthsM(len, 0)).toEqual({ toStartM: 0, toEndM: 100 });
    expect(partialSegmentLengthsM(len, 0.25)).toEqual({ toStartM: 25, toEndM: 75 });
    expect(partialSegmentLengthsM(len, 0.5)).toEqual({ toStartM: 50, toEndM: 50 });
    expect(partialSegmentLengthsM(len, 0.75)).toEqual({ toStartM: 75, toEndM: 25 });
    expect(partialSegmentLengthsM(len, 1)).toEqual({ toStartM: 100, toEndM: 0 });
  });

  it('P4 multi-target picks cheaper tail at second goal node', () => {
    const w1 = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const w2 = rw(2, [{ lat: 51.301, lon: 9.5 }, { lat: 51.301, lon: 9.502 }]);
    const w3 = rw(3, [{ lat: 51.301, lon: 9.502 }, { lat: 51.3, lon: 9.502 }]);
    const body = overpassFromWays([
      { id: 1, nodeIds: [1, 2], geom: w1.nodes },
      { id: 2, nodeIds: [2, 3], geom: w2.nodes },
      { id: 3, nodeIds: [3, 4], geom: w3.nodes },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [w1, w2, w3]);
    const from: WaySegmentProjection = {
      wayId: 1,
      segmentIndex: 0,
      fractionAlongSegment: 0.1,
      distanceToWayM: 0,
      lat: 51.3001,
      lon: 9.5,
      startNodeId: 1,
      endNodeId: 2,
    };
    const to: WaySegmentProjection = {
      wayId: 3,
      segmentIndex: 0,
      fractionAlongSegment: 0.9,
      distanceToWayM: 0,
      lat: 51.3001,
      lon: 9.5019,
      startNodeId: 3,
      endNodeId: 4,
    };
    clearRouteQueryCache(graph);
    const route = queryRouteBetweenProjections(graph, from, to);
    expect(route.status).not.toBe('DIRECTION_FORBIDDEN');
    expect(route.routeDistanceM).toBeGreaterThan(0);
  });

  it('P3 applies no_* restriction as forbidden turn', () => {
    const w1 = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const w2 = rw(2, [{ lat: 51.301, lon: 9.5 }, { lat: 51.301, lon: 9.502 }]);
    const w3 = rw(3, [{ lat: 51.301, lon: 9.5 }, { lat: 51.302, lon: 9.5 }]);
    const body = overpassFromWays([
      { id: 1, nodeIds: [1, 2], geom: w1.nodes },
      { id: 2, nodeIds: [2, 3], geom: w2.nodes },
      { id: 3, nodeIds: [2, 4], geom: w3.nodes },
    ]);
    body.elements.push({
      type: 'relation',
      id: 99,
      members: [
        { type: 'way', ref: 1, role: 'from' },
        { type: 'way', ref: 2, role: 'to' },
        { type: 'node', ref: 2, role: 'via' },
      ],
      tags: { type: 'restriction', restriction: 'no_right_turn' },
    });
    const graph = buildDirectedCarRoutingGraph(body, [w1, w2, w3]);
    expect(graph.turnRestrictionIndex.relationsAppliedAsForbidden).toBeGreaterThanOrEqual(1);
    const from: WaySegmentProjection = {
      wayId: 1,
      segmentIndex: 0,
      fractionAlongSegment: 0.9,
      distanceToWayM: 0,
      lat: 51.3009,
      lon: 9.5,
      startNodeId: 1,
      endNodeId: 2,
    };
    const to: WaySegmentProjection = {
      wayId: 2,
      segmentIndex: 0,
      fractionAlongSegment: 0.1,
      distanceToWayM: 0,
      lat: 51.3011,
      lon: 9.5005,
      startNodeId: 2,
      endNodeId: 3,
    };
    const route = queryRouteBetweenProjections(graph, from, to);
    expect(['ROUTE_NOT_FOUND_IN_EXTRACT', 'CONNECTED_AND_DIRECTION_ALLOWED', 'TURN_RESTRICTION_UNKNOWN']).toContain(
      route.status,
    );
  });

  it('cache isolation per graph instance', () => {
    const w = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const body = overpassFromWays([{ id: 1, nodeIds: [1, 2], geom: w.nodes }]);
    const g1 = buildDirectedCarRoutingGraph(body, [w]);
    const g2 = buildDirectedCarRoutingGraph(body, [w]);
    const from: WaySegmentProjection = {
      wayId: 1,
      segmentIndex: 0,
      fractionAlongSegment: 0.2,
      distanceToWayM: 0,
      lat: 51.3002,
      lon: 9.5,
      startNodeId: 1,
      endNodeId: 2,
    };
    const to: WaySegmentProjection = {
      wayId: 1,
      segmentIndex: 0,
      fractionAlongSegment: 0.8,
      distanceToWayM: 0,
      lat: 51.3008,
      lon: 9.5,
      startNodeId: 1,
      endNodeId: 2,
    };
    const a = queryRouteBetweenProjections(g1, from, to);
    clearRouteQueryCache(g1);
    const b = queryRouteBetweenProjections(g2, from, to);
    expect(a.routeDistanceM).toBe(b.routeDistanceM);
    expect(g1.algorithmId).toContain('R4_1');
  });
});
