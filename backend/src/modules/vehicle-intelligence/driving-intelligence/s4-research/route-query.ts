import { haversineMeters } from '../speed-qc/di-v0-speed-qc-geo';
import type { DirectedCarRoutingGraph, RouteTopologyStatus } from './osm-directed-routing-graph';
import { junctionTurnRestrictionUnknown } from './osm-directed-routing-graph';
import type { S4RouteAwareResearchConfig } from './route-aware-config';
import { DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG } from './route-aware-config';
import type { WaySegmentProjection } from './route-segment-projection';

export type RouteQueryResult = {
  status: RouteTopologyStatus;
  airDistanceM: number;
  routeDistanceM: number;
  directionChanges: number;
  topologyUncertainty: boolean;
  turnRestrictionUnknown: boolean;
  nodePath: number[];
  waySegments: Array<{ wayId: number; segmentIndex: number }>;
  computeMs: number;
};

type DijkstraState = {
  nodeId: number;
  costM: number;
  prevNode: number | null;
  incomingWayId: number | null;
  directionChanges: number;
  turnUnknown: boolean;
};

function airM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  return haversineMeters(a.lat, a.lon, b.lat, b.lon);
}

function partialSegmentM(graph: DirectedCarRoutingGraph, proj: WaySegmentProjection): {
  toStartM: number;
  toEndM: number;
  totalSegM: number;
} {
  const start = proj.startNodeId;
  const end = proj.endNodeId;
  if (start == null || end == null) return { toStartM: 0, toEndM: 0, totalSegM: 0 };
  const totalSegM = haversineMeters(
    graph.nodeCoords.get(start)!.lat,
    graph.nodeCoords.get(start)!.lon,
    graph.nodeCoords.get(end)!.lat,
    graph.nodeCoords.get(end)!.lon,
  );
  const toEndM = totalSegM * proj.fractionAlongSegment;
  const toStartM = totalSegM - toEndM;
  return { toStartM, toEndM, totalSegM };
}

function routeKey(from: WaySegmentProjection, to: WaySegmentProjection): string {
  return [
    from.wayId,
    from.segmentIndex,
    from.fractionAlongSegment.toFixed(6),
    to.wayId,
    to.segmentIndex,
    to.fractionAlongSegment.toFixed(6),
  ].join(':');
}

const routeCache = new Map<string, RouteQueryResult>();

export function clearRouteQueryCache(): void {
  routeCache.clear();
}

export function queryRouteBetweenProjections(
  graph: DirectedCarRoutingGraph,
  from: WaySegmentProjection,
  to: WaySegmentProjection,
  config: S4RouteAwareResearchConfig = DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG,
): RouteQueryResult {
  const key = routeKey(from, to);
  const cached = routeCache.get(key);
  if (cached) return { ...cached, computeMs: 0 };

  const t0 = performance.now();
  const airDistanceM = airM(from, to);

  if (from.startNodeId == null || from.endNodeId == null || to.startNodeId == null || to.endNodeId == null) {
    const res: RouteQueryResult = {
      status: 'TOPOLOGY_INCOMPLETE',
      airDistanceM,
      routeDistanceM: airDistanceM,
      directionChanges: 0,
      topologyUncertainty: true,
      turnRestrictionUnknown: !graph.turnRestrictionRelationsPresent,
      nodePath: [],
      waySegments: [],
      computeMs: performance.now() - t0,
    };
    routeCache.set(key, res);
    return res;
  }

  if (from.wayId === to.wayId && from.segmentIndex === to.segmentIndex) {
    const partial = partialSegmentM(graph, from);
    const routeDistanceM = Math.abs(
      partial.totalSegM * (to.fractionAlongSegment - from.fractionAlongSegment),
    );
    const res: RouteQueryResult = {
      status: 'CONNECTED_AND_DIRECTION_ALLOWED',
      airDistanceM,
      routeDistanceM,
      directionChanges: 0,
      topologyUncertainty: false,
      turnRestrictionUnknown: false,
      nodePath: [from.startNodeId, from.endNodeId],
      waySegments: [{ wayId: from.wayId, segmentIndex: from.segmentIndex }],
      computeMs: performance.now() - t0,
    };
    routeCache.set(key, res);
    return res;
  }

  const fromPartial = partialSegmentM(graph, from);
  const toPartial = partialSegmentM(graph, to);

  const startNodes = [
    { nodeId: from.startNodeId, extraM: fromPartial.toStartM },
    { nodeId: from.endNodeId, extraM: fromPartial.toEndM },
  ];
  const goalNodes = new Set([to.startNodeId, to.endNodeId]);

  type QueueItem = DijkstraState;
  const best = new Map<number, QueueItem>();
  const queue: QueueItem[] = [];

  for (const s of startNodes) {
    const st: QueueItem = {
      nodeId: s.nodeId,
      costM: s.extraM,
      prevNode: null,
      incomingWayId: null,
      directionChanges: 0,
      turnUnknown: junctionTurnRestrictionUnknown(graph, s.nodeId),
    };
    best.set(s.nodeId, st);
    queue.push(st);
  }

  let expansions = 0;
  let found: QueueItem | null = null;
  let foundTailM = 0;

  while (queue.length > 0 && expansions < config.maxRoutingExpansions) {
    queue.sort((a, b) => a.costM - b.costM);
    const cur = queue.shift()!;
    expansions += 1;
    const known = best.get(cur.nodeId);
    if (!known || known.costM < cur.costM) continue;
    if (cur.costM > config.maxRouteDistanceM) continue;

    if (goalNodes.has(cur.nodeId)) {
      found = cur;
      foundTailM = cur.nodeId === to.startNodeId ? toPartial.toStartM : toPartial.toEndM;
      break;
    }

    for (const edge of graph.adjacency.get(cur.nodeId) ?? []) {
      const turnAtJunction =
        cur.incomingWayId != null &&
        cur.incomingWayId !== edge.wayId &&
        junctionTurnRestrictionUnknown(graph, cur.nodeId);
      const next: QueueItem = {
        nodeId: edge.toNodeId,
        costM: cur.costM + edge.distanceM,
        prevNode: cur.nodeId,
        incomingWayId: edge.wayId,
        directionChanges: cur.directionChanges + (cur.incomingWayId != null && cur.incomingWayId !== edge.wayId ? 1 : 0),
        turnUnknown: cur.turnUnknown || turnAtJunction,
      };
      const prev = best.get(edge.toNodeId);
      if (!prev || next.costM < prev.costM) {
        best.set(edge.toNodeId, next);
        queue.push(next);
      }
    }
  }

  const computeMs = performance.now() - t0;

  if (!found) {
    const res: RouteQueryResult = {
      status: 'ROUTE_NOT_FOUND_IN_EXTRACT',
      airDistanceM,
      routeDistanceM: airDistanceM,
      directionChanges: 0,
      topologyUncertainty: true,
      turnRestrictionUnknown: !graph.turnRestrictionRelationsPresent,
      nodePath: [],
      waySegments: [],
      computeMs,
    };
    routeCache.set(key, res);
    return res;
  }

  const nodePath: number[] = [];
  const waySegments: Array<{ wayId: number; segmentIndex: number }> = [];
  let walkNode: number | null = found.nodeId;
  while (walkNode != null) {
    nodePath.unshift(walkNode);
    const walk = best.get(walkNode);
    if (walk?.prevNode != null) {
      const edge = (graph.adjacency.get(walk.prevNode) ?? []).find((e) => e.toNodeId === walkNode);
      if (edge) waySegments.unshift({ wayId: edge.wayId, segmentIndex: edge.segmentIndex });
      walkNode = walk.prevNode;
    } else {
      walkNode = null;
    }
  }

  const routeDistanceM = found.costM + foundTailM;
  const res: RouteQueryResult = {
    status: found.turnUnknown ? 'TURN_RESTRICTION_UNKNOWN' : 'CONNECTED_AND_DIRECTION_ALLOWED',
    airDistanceM,
    routeDistanceM,
    directionChanges: found.directionChanges,
    topologyUncertainty: found.turnUnknown,
    turnRestrictionUnknown: found.turnUnknown,
    nodePath,
    waySegments,
    computeMs,
  };
  routeCache.set(key, res);
  return res;
}
