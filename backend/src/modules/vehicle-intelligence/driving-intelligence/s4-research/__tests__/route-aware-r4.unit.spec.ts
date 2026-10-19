import {
  buildDirectedCarRoutingGraph,
  clearRouteQueryCache,
  goalTurnOntoDestinationWay,
  queryRouteBetweenProjections,
  queryRouteBetweenProjectionsWithQueue,
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

function proj(
  wayId: number,
  segmentIndex: number,
  fraction: number,
  startNodeId: number,
  endNodeId: number,
  lat: number,
  lon: number,
): WaySegmentProjection {
  return {
    wayId,
    segmentIndex,
    fractionAlongSegment: fraction,
    distanceToWayM: 0,
    lat,
    lon,
    startNodeId,
    endNodeId,
  };
}

describe('route-aware R4 endpoint turns + heap parity', () => {
  it('P1: no_* at first junction blocks direct route; legal alternate exists', () => {
    const wIn = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const wBad = rw(2, [{ lat: 51.301, lon: 9.5 }, { lat: 51.302, lon: 9.5 }]);
    const wGood = rw(3, [{ lat: 51.301, lon: 9.5 }, { lat: 51.301, lon: 9.502 }, { lat: 51.302, lon: 9.502 }]);
    const body = overpass(
      [
        { id: 1, nodeIds: [1, 2], geom: wIn.nodes },
        { id: 2, nodeIds: [2, 4], geom: wBad.nodes },
        { id: 3, nodeIds: [2, 3, 4], geom: wGood.nodes },
      ],
      [
        {
          type: 'relation',
          id: 601,
          members: [
            { type: 'way', ref: 1, role: 'from' },
            { type: 'way', ref: 2, role: 'to' },
            { type: 'node', ref: 2, role: 'via' },
          ],
          tags: { type: 'restriction', restriction: 'no_right_turn' },
        },
      ],
    );
    const graph = buildDirectedCarRoutingGraph(body, [wIn, wBad, wGood]);
    const from = proj(1, 0, 0.9, 1, 2, 51.3009, 9.5);
    const to = proj(2, 0, 0.5, 2, 4, 51.3015, 9.5);
    clearRouteQueryCache(graph);
    const route = queryRouteBetweenProjections(graph, from, to);
    expect(route.status).not.toBe('CONNECTED_AND_DIRECTION_ALLOWED');
    expect(route.waySegments.some((s) => s.wayId === 2)).toBe(false);
  });

  it('P1: no_* at goal junction onto destination way blocks arrival', () => {
    const wIn = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const wDest = rw(2, [{ lat: 51.301, lon: 9.5 }, { lat: 51.301, lon: 9.502 }]);
    const body = overpass(
      [
        { id: 1, nodeIds: [1, 2], geom: wIn.nodes },
        { id: 2, nodeIds: [2, 3], geom: wDest.nodes },
      ],
      [
        {
          type: 'relation',
          id: 602,
          members: [
            { type: 'way', ref: 1, role: 'from' },
            { type: 'way', ref: 2, role: 'to' },
            { type: 'node', ref: 2, role: 'via' },
          ],
          tags: { type: 'restriction', restriction: 'no_right_turn' },
        },
      ],
    );
    const graph = buildDirectedCarRoutingGraph(body, [wIn, wDest]);
    expect(goalTurnOntoDestinationWay(graph, 2, 1, 2)).toBe('forbidden');
    const from = proj(1, 0, 0.9, 1, 2, 51.3009, 9.5);
    const to = proj(2, 0, 0.3, 2, 3, 51.3011, 9.5005);
    clearRouteQueryCache(graph);
    const route = queryRouteBetweenProjections(graph, from, to);
    expect(route.status).toBe('ROUTE_NOT_FOUND_IN_EXTRACT');
  });

  it('P1: only_* at via marks goal turn unknown', () => {
    const wIn = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const wDest = rw(2, [{ lat: 51.301, lon: 9.5 }, { lat: 51.301, lon: 9.502 }]);
    const body = overpass(
      [
        { id: 1, nodeIds: [1, 2], geom: wIn.nodes },
        { id: 2, nodeIds: [2, 3], geom: wDest.nodes },
      ],
      [
        {
          type: 'relation',
          id: 603,
          members: [
            { type: 'way', ref: 1, role: 'from' },
            { type: 'way', ref: 2, role: 'to' },
            { type: 'node', ref: 2, role: 'via' },
          ],
          tags: { type: 'restriction', restriction: 'only_right_turn' },
        },
      ],
    );
    const graph = buildDirectedCarRoutingGraph(body, [wIn, wDest]);
    expect(goalTurnOntoDestinationWay(graph, 2, 1, 2)).toBe('unknown');
  });

  it('P2: same-segment oneway backward uses ring detour', () => {
    const loop = rw(10, [
      { lat: 51.3, lon: 9.5 },
      { lat: 51.301, lon: 9.5 },
      { lat: 51.301, lon: 9.501 },
      { lat: 51.3, lon: 9.501 },
      { lat: 51.3, lon: 9.5 },
    ], { oneway: 'yes' });
    const body = overpass([{ id: 10, nodeIds: [1, 2, 3, 4, 1], geom: loop.nodes, tags: { highway: 'residential', oneway: 'yes' } }]);
    const graph = buildDirectedCarRoutingGraph(body, [loop]);
    const from = proj(10, 1, 0.8, 2, 3, 51.301, 9.5008);
    const to = proj(10, 0, 0.2, 1, 2, 51.3002, 9.5);
    clearRouteQueryCache(graph);
    const route = queryRouteBetweenProjections(graph, from, to);
    expect(route.status).not.toBe('DIRECTION_FORBIDDEN');
    expect(route.routeDistanceM).toBeGreaterThan(0);
  });

  it('P2: same position on segment → zero distance', () => {
    const w = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const body = overpass([{ id: 1, nodeIds: [1, 2], geom: w.nodes }]);
    const graph = buildDirectedCarRoutingGraph(body, [w]);
    const p = proj(1, 0, 0.4, 1, 2, 51.3004, 9.5);
    clearRouteQueryCache(graph);
    const route = queryRouteBetweenProjections(graph, p, p);
    expect(route.routeDistanceM).toBe(0);
    expect(route.status).toBe('CONNECTED_AND_DIRECTION_ALLOWED');
  });

  it('P4: heap vs sort Dijkstra parity on shared topology', () => {
    const wIn = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const wAllowed = rw(2, [
      { lat: 51.301, lon: 9.5 },
      { lat: 51.301, lon: 9.501 },
      { lat: 51.301, lon: 9.502 },
    ]);
    const body = overpass([
      { id: 1, nodeIds: [1, 2], geom: wIn.nodes },
      { id: 2, nodeIds: [2, 21, 3], geom: wAllowed.nodes },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [wIn, wAllowed]);
    const from = proj(1, 0, 0.9, 1, 2, 51.3009, 9.5);
    const to = proj(2, 1, 0.5, 21, 3, 51.301, 9.5015);
    const heap = queryRouteBetweenProjectionsWithQueue(graph, from, to, undefined, 'heap');
    const sort = queryRouteBetweenProjectionsWithQueue(graph, from, to, undefined, 'sort');
    expect(heap.status).toBe(sort.status);
    expect(heap.routeDistanceM).toBeCloseTo(sort.routeDistanceM, 6);
    expect(heap.nodePath).toEqual(sort.nodePath);
    expect(heap.waySegments).toEqual(sort.waySegments);
  });
});
