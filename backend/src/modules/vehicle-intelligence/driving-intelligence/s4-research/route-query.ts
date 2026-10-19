import { haversineMeters } from '../speed-qc/di-v0-speed-qc-geo';
import type { DirectedCarRoutingGraph, RouteTopologyStatus } from './osm-directed-routing-graph';
import type { DirectedRoutingEdge } from './osm-directed-routing-graph';
import { junctionTurnRestrictionUnknown } from './osm-directed-routing-graph';
import { isOnlyRestrictionJunction, isTurnForbidden } from './osm-turn-restrictions';
import type { S4RouteAwareResearchConfig } from './route-aware-config';
import { DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG } from './route-aware-config';
import type { WaySegmentProjection } from './route-segment-projection';
import { arrivalTailCostM, departureAttachments } from './route-projection-attachment';

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

type SearchState = {
  key: string;
  nodeId: number;
  incomingWayId: number | null;
  costM: number;
  prevKey: string | null;
  incomingEdge: DirectedRoutingEdge | null;
  directionChanges: number;
  turnUnknown: boolean;
};

function stateKey(nodeId: number, incomingWayId: number | null): string {
  return `${nodeId}:${incomingWayId ?? -1}`;
}

/** P1: distance from segment start / end nodes to projection. */
export function partialSegmentLengthsM(
  segmentLengthM: number,
  fractionAlongSegment: number,
): { toStartM: number; toEndM: number } {
  const f = Math.max(0, Math.min(1, fractionAlongSegment));
  return {
    toStartM: f * segmentLengthM,
    toEndM: (1 - f) * segmentLengthM,
  };
}

function segmentLengthForProjection(
  graph: DirectedCarRoutingGraph,
  proj: WaySegmentProjection,
): number {
  const start = proj.startNodeId;
  const end = proj.endNodeId;
  if (start == null || end == null) return 0;
  return haversineMeters(
    graph.nodeCoords.get(start)!.lat,
    graph.nodeCoords.get(start)!.lon,
    graph.nodeCoords.get(end)!.lat,
    graph.nodeCoords.get(end)!.lon,
  );
}

function airM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  return haversineMeters(a.lat, a.lon, b.lat, b.lon);
}

function routeKey(
  graph: DirectedCarRoutingGraph,
  from: WaySegmentProjection,
  to: WaySegmentProjection,
  config: S4RouteAwareResearchConfig,
): string {
  return [
    graph.algorithmId,
    graph.turnRestrictionIndex.relationsAppliedAsForbidden,
    config.maxRoutingExpansions,
    config.maxRouteDistanceM,
    from.wayId,
    from.segmentIndex,
    from.fractionAlongSegment.toFixed(6),
    to.wayId,
    to.segmentIndex,
    to.fractionAlongSegment.toFixed(6),
  ].join(':');
}

const cacheByGraph = new WeakMap<DirectedCarRoutingGraph, Map<string, RouteQueryResult>>();

export const routeQueryRuntimeProfile = {
  queryCount: 0,
  totalComputeMs: 0,
};

export function resetRouteQueryRuntimeProfile(): void {
  routeQueryRuntimeProfile.queryCount = 0;
  routeQueryRuntimeProfile.totalComputeMs = 0;
}

export function clearRouteQueryCache(graph?: DirectedCarRoutingGraph): void {
  if (graph) cacheByGraph.delete(graph);
}

function compareSearchState(a: SearchState, b: SearchState): number {
  if (a.costM !== b.costM) return a.costM - b.costM;
  if (a.nodeId !== b.nodeId) return a.nodeId - b.nodeId;
  return (a.incomingWayId ?? -1) - (b.incomingWayId ?? -1);
}

function sameSegmentDirectRoute(
  from: WaySegmentProjection,
  to: WaySegmentProjection,
  fromSegLen: number,
  rawFrom: { tags: Record<string, string> } | undefined,
): { routeDistanceM: number; forbidden: boolean } {
  const delta = to.fractionAlongSegment - from.fractionAlongSegment;
  const routeDistanceM = Math.abs(fromSegLen * delta);
  const ow = rawFrom?.tags.oneway;
  const forbidden =
    (ow === 'yes' && delta < 0) ||
    (ow === '-1' && delta > 0) ||
    (rawFrom?.tags.junction === 'roundabout' && delta < 0);
  return { routeDistanceM, forbidden };
}

export function queryRouteBetweenProjections(
  graph: DirectedCarRoutingGraph,
  from: WaySegmentProjection,
  to: WaySegmentProjection,
  config: S4RouteAwareResearchConfig = DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG,
): RouteQueryResult {
  let cache = cacheByGraph.get(graph);
  if (!cache) {
    cache = new Map();
    cacheByGraph.set(graph, cache);
  }
  const key = routeKey(graph, from, to, config);
  const cached = cache.get(key);
  if (cached) return { ...cached, computeMs: 0 };

  const t0 = performance.now();
  const airDistanceM = airM(from, to);

  const finish = (res: RouteQueryResult): RouteQueryResult => {
    const computeMs = performance.now() - t0;
    const out = { ...res, computeMs };
    cache!.set(key, out);
    routeQueryRuntimeProfile.queryCount += 1;
    routeQueryRuntimeProfile.totalComputeMs += computeMs;
    return out;
  };

  if (from.startNodeId == null || from.endNodeId == null || to.startNodeId == null || to.endNodeId == null) {
    return finish({
      status: 'TOPOLOGY_INCOMPLETE',
      airDistanceM,
      routeDistanceM: airDistanceM,
      directionChanges: 0,
      topologyUncertainty: true,
      turnRestrictionUnknown: false,
      nodePath: [],
      waySegments: [],
      computeMs: 0,
    });
  }

  const rawFrom = graph.rawWaysById.get(from.wayId);
  const rawTo = graph.rawWaysById.get(to.wayId);
  const fromSegLen = segmentLengthForProjection(graph, from);
  const toSegLen = segmentLengthForProjection(graph, to);

  if (from.wayId === to.wayId && from.segmentIndex === to.segmentIndex) {
    const direct = sameSegmentDirectRoute(from, to, fromSegLen, rawFrom);
    return finish({
      status: direct.forbidden ? 'DIRECTION_FORBIDDEN' : 'CONNECTED_AND_DIRECTION_ALLOWED',
      airDistanceM,
      routeDistanceM: direct.routeDistanceM,
      directionChanges: 0,
      topologyUncertainty: false,
      turnRestrictionUnknown: false,
      nodePath: [from.startNodeId, from.endNodeId],
      waySegments: [{ wayId: from.wayId, segmentIndex: from.segmentIndex }],
      computeMs: 0,
    });
  }

  const startAttachments = departureAttachments(from, rawFrom, fromSegLen);
  const goalNodeIds = [to.startNodeId, to.endNodeId];

  if (startAttachments.length === 0) {
    return finish({
      status: 'DIRECTION_FORBIDDEN',
      airDistanceM,
      routeDistanceM: airDistanceM,
      directionChanges: 0,
      topologyUncertainty: false,
      turnRestrictionUnknown: false,
      nodePath: [],
      waySegments: [],
      computeMs: 0,
    });
  }

  const best = new Map<string, SearchState>();
  const queue: SearchState[] = [];

  for (const s of startAttachments) {
    const keyStart = stateKey(s.nodeId, null);
    const st: SearchState = {
      key: keyStart,
      nodeId: s.nodeId,
      incomingWayId: null,
      costM: s.linkCostM,
      prevKey: null,
      incomingEdge: null,
      directionChanges: 0,
      turnUnknown: junctionTurnRestrictionUnknown(graph, s.nodeId),
    };
    const prev = best.get(keyStart);
    if (!prev || compareSearchState(st, prev) < 0) {
      best.set(keyStart, st);
      queue.push(st);
    }
  }

  let expansions = 0;
  type GoalPick = { state: SearchState; tailM: number; totalM: number; goalNode: number };
  let bestGoal: GoalPick | null = null;

  const considerGoal = (state: SearchState) => {
    for (const goalNode of goalNodeIds) {
      if (state.nodeId !== goalNode) continue;
      const tail = arrivalTailCostM(to, rawTo, toSegLen, goalNode);
      if (tail == null) continue;
      const totalM = state.costM + tail;
      if (totalM > config.maxRouteDistanceM) continue;
      if (!bestGoal || totalM < bestGoal.totalM) {
        bestGoal = { state, tailM: tail, totalM, goalNode };
      } else if (totalM === bestGoal.totalM && compareSearchState(state, bestGoal.state) < 0) {
        bestGoal = { state, tailM: tail, totalM, goalNode };
      }
    }
  };

  while (queue.length > 0 && expansions < config.maxRoutingExpansions) {
    queue.sort(compareSearchState);
    const cur = queue.shift()!;
    expansions += 1;
    const known = best.get(cur.key);
    if (!known || compareSearchState(known, cur) < 0) continue;
    if (cur.costM > config.maxRouteDistanceM) continue;

    considerGoal(cur);

    for (const edge of graph.adjacency.get(cur.nodeId) ?? []) {
      const via = cur.nodeId;
      const fromWay = cur.incomingWayId;
      const toWay = edge.wayId;
      if (fromWay != null && fromWay !== toWay) {
        if (isTurnForbidden(graph.turnRestrictionIndex, via, fromWay, toWay)) {
          continue;
        }
      }
      const turnAtJunction =
        fromWay != null &&
        fromWay !== toWay &&
        (junctionTurnRestrictionUnknown(graph, via) || isOnlyRestrictionJunction(graph.turnRestrictionIndex, via));
      const nextKey = stateKey(edge.toNodeId, edge.wayId);
      const next: SearchState = {
        key: nextKey,
        nodeId: edge.toNodeId,
        incomingWayId: edge.wayId,
        costM: cur.costM + edge.distanceM,
        prevKey: cur.key,
        incomingEdge: edge,
        directionChanges: cur.directionChanges + (fromWay != null && fromWay !== toWay ? 1 : 0),
        turnUnknown: cur.turnUnknown || turnAtJunction,
      };
      const prev = best.get(nextKey);
      if (!prev || compareSearchState(next, prev) < 0) {
        best.set(nextKey, next);
        queue.push(next);
      }
    }
  }

  for (const state of best.values()) {
    considerGoal(state);
  }

  if (!bestGoal) {
    return finish({
      status: 'ROUTE_NOT_FOUND_IN_EXTRACT',
      airDistanceM,
      routeDistanceM: airDistanceM,
      directionChanges: 0,
      topologyUncertainty: true,
      turnRestrictionUnknown: false,
      nodePath: [],
      waySegments: [],
      computeMs: 0,
    });
  }

  const goalPick: GoalPick = bestGoal;
  const found = goalPick.state;
  const nodePath: number[] = [found.nodeId];
  const waySegments: Array<{ wayId: number; segmentIndex: number }> = [];
  let walk: SearchState | undefined = found;
  while (walk?.prevKey != null) {
    const prev = best.get(walk.prevKey);
    if (!prev) break;
    if (walk.incomingEdge) {
      waySegments.unshift({ wayId: walk.incomingEdge.wayId, segmentIndex: walk.incomingEdge.segmentIndex });
    }
    nodePath.unshift(prev.nodeId);
    walk = prev;
  }

  const goalOnDestinationWay =
    goalPick.goalNode === to.startNodeId || goalPick.goalNode === to.endNodeId;
  if (from.wayId !== to.wayId && waySegments.length === 0 && !goalOnDestinationWay) {
    return finish({
      status: 'ROUTE_NOT_FOUND_IN_EXTRACT',
      airDistanceM,
      routeDistanceM: airDistanceM,
      directionChanges: 0,
      topologyUncertainty: true,
      turnRestrictionUnknown: false,
      nodePath: [],
      waySegments: [],
      computeMs: 0,
    });
  }

  return finish({
    status: found.turnUnknown ? 'TURN_RESTRICTION_UNKNOWN' : 'CONNECTED_AND_DIRECTION_ALLOWED',
    airDistanceM,
    routeDistanceM: goalPick.totalM,
    directionChanges: found.directionChanges,
    topologyUncertainty: found.turnUnknown,
    turnRestrictionUnknown: found.turnUnknown,
    nodePath,
    waySegments,
    computeMs: 0,
  });
}
