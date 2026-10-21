import {
  buildDirectedCarRoutingGraph,
  clearRouteQueryCache,
  queryRouteBetweenProjections,
  type ResearchOsmWay,
} from '../index';
import type { WaySegmentProjection } from '../route-segment-projection';
import { isTurnForbidden } from '../osm-turn-restrictions';

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
  specs: Array<{ id: number; nodeIds: number[]; geom: Array<{ lat: number; lon: number }>; tags?: Record<string, string> }>,
  extraElements: Array<Record<string, unknown>> = [],
): { elements: Array<Record<string, unknown>> } {
  const elements: Array<Record<string, unknown>> = [...extraElements];
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

describe('route-aware R3 routing gate', () => {
  it('P0: false goal acceptance — reachable non-goal node must not complete route', () => {
    const w1 = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }, { lat: 51.302, lon: 9.5 }]);
    const w2 = rw(2, [{ lat: 51.302, lon: 9.502 }, { lat: 51.303, lon: 9.502 }]);
    const body = overpass([
      { id: 1, nodeIds: [1, 2, 3], geom: w1.nodes },
      { id: 2, nodeIds: [4, 5], geom: w2.nodes },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [w1, w2]);
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
      wayId: 2,
      segmentIndex: 0,
      fractionAlongSegment: 0.5,
      distanceToWayM: 0,
      lat: 51.3025,
      lon: 9.502,
      startNodeId: 4,
      endNodeId: 5,
    };
    clearRouteQueryCache(graph);
    const route = queryRouteBetweenProjections(graph, from, to);
    expect(route.status).toBe('ROUTE_NOT_FOUND_IN_EXTRACT');
  });

  it('P1: same node, two incoming ways — only legal turn survives', () => {
    const wIn = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const wAllowed = rw(2, [
      { lat: 51.301, lon: 9.5 },
      { lat: 51.301, lon: 9.501 },
      { lat: 51.301, lon: 9.502 },
    ]);
    const wForbidden = rw(3, [{ lat: 51.301, lon: 9.5 }, { lat: 51.302, lon: 9.5 }]);
    const body = overpass([
      { id: 1, nodeIds: [1, 2], geom: wIn.nodes },
      { id: 2, nodeIds: [2, 21, 3], geom: wAllowed.nodes },
      { id: 3, nodeIds: [2, 4], geom: wForbidden.nodes },
    ]);
    body.elements.push({
      type: 'relation',
      id: 501,
      members: [
        { type: 'way', ref: 1, role: 'from' },
        { type: 'way', ref: 3, role: 'to' },
        { type: 'node', ref: 2, role: 'via' },
      ],
      tags: { type: 'restriction', restriction: 'no_straight_on' },
    });
    const graph = buildDirectedCarRoutingGraph(body, [wIn, wAllowed, wForbidden]);
    expect(isTurnForbidden(graph.turnRestrictionIndex, 2, 1, 3)).toBe(true);
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
      segmentIndex: 1,
      fractionAlongSegment: 0.5,
      distanceToWayM: 0,
      lat: 51.301,
      lon: 9.5015,
      startNodeId: 21,
      endNodeId: 3,
    };
    const route = queryRouteBetweenProjections(graph, from, to);
    expect(route.status).not.toBe('ROUTE_NOT_FOUND_IN_EXTRACT');
    expect(route.status).not.toBe('DIRECTION_FORBIDDEN');
    expect(['CONNECTED_AND_DIRECTION_ALLOWED', 'TURN_RESTRICTION_UNKNOWN']).toContain(route.status);
    expect(route.waySegments.some((s) => s.wayId === 2)).toBe(true);
    expect(route.waySegments.some((s) => s.wayId === 3)).toBe(false);
  });

  it('P2: same way different segment — backward on oneway uses graph detour when present', () => {
    const loop = rw(10, [
      { lat: 51.3, lon: 9.5 },
      { lat: 51.301, lon: 9.5 },
      { lat: 51.301, lon: 9.501 },
      { lat: 51.3, lon: 9.501 },
      { lat: 51.3, lon: 9.5 },
    ], { oneway: 'yes' });
    const body = overpass([
      { id: 10, nodeIds: [1, 2, 3, 4, 1], geom: loop.nodes, tags: { highway: 'residential', oneway: 'yes' } },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [loop]);
    const from: WaySegmentProjection = {
      wayId: 10,
      segmentIndex: 1,
      fractionAlongSegment: 0.8,
      distanceToWayM: 0,
      lat: 51.301,
      lon: 9.5008,
      startNodeId: 2,
      endNodeId: 3,
    };
    const to: WaySegmentProjection = {
      wayId: 10,
      segmentIndex: 0,
      fractionAlongSegment: 0.2,
      distanceToWayM: 0,
      lat: 51.3002,
      lon: 9.5,
      startNodeId: 1,
      endNodeId: 2,
    };
    const route = queryRouteBetweenProjections(graph, from, to);
    expect(route.status).not.toBe('DIRECTION_FORBIDDEN');
    expect(route.routeDistanceM).toBeGreaterThan(0);
  });
});
