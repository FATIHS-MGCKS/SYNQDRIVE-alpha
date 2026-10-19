import { haversineMeters } from '../speed-qc/di-v0-speed-qc-geo';
import type { DirectedCarRoutingGraph, RouteTopologyStatus } from './osm-directed-routing-graph';
import type { DirectedRoutingEdge } from './osm-directed-routing-graph';
import { junctionTurnRestrictionUnknown } from './osm-directed-routing-graph';
import { isOnlyRestrictionJunction, isTurnForbidden } from './osm-turn-restrictions';
import type { S4RouteAwareResearchConfig } from './route-aware-config';
import { DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG } from './route-aware-config';
import type { WaySegmentProjection } from './route-segment-projection';
import { arrivalTailCostM, departureAttachments } from './route-projection-attachment';
import type { RawOsmWay } from './osm-parse';
import { RouteQueryMinHeap } from './route-query-min-heap';

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

export type RouteQueryQueueImpl = 'heap' | 'sort';

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
  cacheHits: 0,
  cacheMisses: 0,
  totalComputeMs: 0,
};

export function resetRouteQueryRuntimeProfile(): void {
  routeQueryRuntimeProfile.queryCount = 0;
  routeQueryRuntimeProfile.cacheHits = 0;
  routeQueryRuntimeProfile.cacheMisses = 0;
  routeQueryRuntimeProfile.totalComputeMs = 0;
}

export function clearRouteQueryCache(graph?: DirectedCarRoutingGraph): void {
  if (graph) cacheByGraph.delete(graph);
}

export function compareSearchState(a: SearchState, b: SearchState): number {
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

/** Endpoint: may we enter the destination way at `via` from `incomingWayId`? */
export function goalTurnOntoDestinationWay(
  graph: DirectedCarRoutingGraph,
  viaNodeId: number,
  incomingWayId: number | null,
  destWayId: number,
): 'allowed' | 'forbidden' | 'unknown' {
  if (incomingWayId == null) return 'unknown';
  if (incomingWayId === destWayId) return 'allowed';
  if (isTurnForbidden(graph.turnRestrictionIndex, viaNodeId, incomingWayId, destWayId)) {
    return 'forbidden';
  }
  if (
    junctionTurnRestrictionUnknown(graph, viaNodeId) ||
    isOnlyRestrictionJunction(graph.turnRestrictionIndex, viaNodeId)
  ) {
    return 'unknown';
  }
  return 'allowed';
}

type GoalPick = { state: SearchState; tailM: number; totalM: number; goalNode: number; goalTurnUnknown: boolean };

function runDijkstraBetweenProjections(
  graph: DirectedCarRoutingGraph,
  from: WaySegmentProjection,
  to: WaySegmentProjection,
  rawFrom: RawOsmWay | undefined,
  rawTo: RawOsmWay | undefined,
  fromSegLen: number,
  toSegLen: number,
  config: S4RouteAwareResearchConfig,
  queueImpl: RouteQueryQueueImpl,
): { goalPick: GoalPick | null; best: Map<string, SearchState> } {
  const best = new Map<string, SearchState>();
  const startAttachments = departureAttachments(from, rawFrom, fromSegLen);
  const goalNodeIds = [to.startNodeId!, to.endNodeId!];
  if (startAttachments.length === 0) return { goalPick: null, best };

  const queueSort: SearchState[] = [];
  const queueHeap =
    queueImpl === 'heap' ? new RouteQueryMinHeap<SearchState>(compareSearchState) : null;

  const enqueue = (st: SearchState) => {
    if (queueImpl === 'heap') queueHeap!.push(st);
    else queueSort.push(st);
  };

  for (const s of startAttachments) {
    const keyStart = stateKey(s.nodeId, s.incomingWayId);
    const st: SearchState = {
      key: keyStart,
      nodeId: s.nodeId,
      incomingWayId: s.incomingWayId,
      costM: s.linkCostM,
      prevKey: null,
      incomingEdge: null,
      directionChanges: 0,
      turnUnknown: junctionTurnRestrictionUnknown(graph, s.nodeId),
    };
    const prev = best.get(keyStart);
    if (!prev || compareSearchState(st, prev) < 0) {
      best.set(keyStart, st);
      enqueue(st);
    }
  }

  let bestGoal: GoalPick | null = null;

  const considerGoal = (state: SearchState) => {
    for (const goalNode of goalNodeIds) {
      if (state.nodeId !== goalNode) continue;
      const turn = goalTurnOntoDestinationWay(graph, goalNode, state.incomingWayId, to.wayId);
      if (turn === 'forbidden') continue;
      const tail = arrivalTailCostM(to, rawTo, toSegLen, goalNode);
      if (tail == null) continue;
      const totalM = state.costM + tail;
      if (totalM > config.maxRouteDistanceM) continue;
      const goalTurnUnknown = turn === 'unknown' || state.turnUnknown;
      const pick: GoalPick = { state, tailM: tail, totalM, goalNode, goalTurnUnknown };
      if (!bestGoal || pick.totalM < bestGoal.totalM) {
        bestGoal = pick;
      } else if (pick.totalM === bestGoal.totalM && compareSearchState(pick.state, bestGoal.state) < 0) {
        bestGoal = pick;
      }
    }
  };

  let expansions = 0;
  while (expansions < config.maxRoutingExpansions) {
    let cur: SearchState | undefined;
    if (queueImpl === 'heap') {
      if (queueHeap!.size === 0) break;
      cur = queueHeap!.pop();
    } else {
      if (queueSort.length === 0) break;
      queueSort.sort(compareSearchState);
      cur = queueSort.shift();
    }
    if (!cur) break;
    expansions += 1;
    const known = best.get(cur.key);
    if (!known || compareSearchState(known, cur) < 0) continue;
    if (cur.costM > config.maxRouteDistanceM) continue;

    considerGoal(cur);

    for (const edge of graph.adjacency.get(cur.nodeId) ?? []) {
      const via = cur.nodeId;
      const fromWay = cur.incomingWayId;
      const toWay = edge.wayId;
      if (fromWay == null) {
        continue;
      }
      if (fromWay !== toWay) {
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
        enqueue(next);
      }
    }
  }

  for (const state of best.values()) {
    considerGoal(state);
  }

  return { goalPick: bestGoal, best };
}

function buildResultFromGoal(
  graph: DirectedCarRoutingGraph,
  from: WaySegmentProjection,
  to: WaySegmentProjection,
  airDistanceM: number,
  goalPick: GoalPick,
  best: Map<string, SearchState>,
): RouteQueryResult {
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
    return {
      status: 'ROUTE_NOT_FOUND_IN_EXTRACT',
      airDistanceM,
      routeDistanceM: airDistanceM,
      directionChanges: 0,
      topologyUncertainty: true,
      turnRestrictionUnknown: false,
      nodePath: [],
      waySegments: [],
      computeMs: 0,
    };
  }

  const turnUnknown = goalPick.goalTurnUnknown || found.turnUnknown;
  return {
    status: turnUnknown ? 'TURN_RESTRICTION_UNKNOWN' : 'CONNECTED_AND_DIRECTION_ALLOWED',
    airDistanceM,
    routeDistanceM: goalPick.totalM,
    directionChanges: found.directionChanges,
    topologyUncertainty: turnUnknown,
    turnRestrictionUnknown: turnUnknown,
    nodePath,
    waySegments,
    computeMs: 0,
  };
}

/** Test-only: reference queue.sort Dijkstra vs production heap. */
export function queryRouteBetweenProjectionsWithQueue(
  graph: DirectedCarRoutingGraph,
  from: WaySegmentProjection,
  to: WaySegmentProjection,
  config: S4RouteAwareResearchConfig = DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG,
  queueImpl: RouteQueryQueueImpl = 'heap',
): RouteQueryResult {
  clearRouteQueryCache(graph);
  return queryRouteBetweenProjections(graph, from, to, config, queueImpl);
}

export function queryRouteBetweenProjections(
  graph: DirectedCarRoutingGraph,
  from: WaySegmentProjection,
  to: WaySegmentProjection,
  config: S4RouteAwareResearchConfig = DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG,
  queueImpl: RouteQueryQueueImpl = 'heap',
): RouteQueryResult {
  let cache = cacheByGraph.get(graph);
  if (!cache) {
    cache = new Map();
    cacheByGraph.set(graph, cache);
  }
  const key = routeKey(graph, from, to, config);
  const cached = cache.get(key);
  if (cached) {
    routeQueryRuntimeProfile.cacheHits += 1;
    return { ...cached, computeMs: 0 };
  }

  const t0 = performance.now();
  const airDistanceM = airM(from, to);

  const finish = (res: RouteQueryResult): RouteQueryResult => {
    const computeMs = performance.now() - t0;
    const out = { ...res, computeMs };
    cache!.set(key, out);
    routeQueryRuntimeProfile.queryCount += 1;
    routeQueryRuntimeProfile.cacheMisses += 1;
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
    const delta = to.fractionAlongSegment - from.fractionAlongSegment;
    if (Math.abs(delta) < 1e-9) {
      return finish({
        status: 'CONNECTED_AND_DIRECTION_ALLOWED',
        airDistanceM,
        routeDistanceM: 0,
        directionChanges: 0,
        topologyUncertainty: false,
        turnRestrictionUnknown: false,
        nodePath: [from.startNodeId, from.endNodeId],
        waySegments: [{ wayId: from.wayId, segmentIndex: from.segmentIndex }],
        computeMs: 0,
      });
    }
    const direct = sameSegmentDirectRoute(from, to, fromSegLen, rawFrom);
    if (!direct.forbidden) {
      return finish({
        status: 'CONNECTED_AND_DIRECTION_ALLOWED',
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
  }

  const startAttachments = departureAttachments(from, rawFrom, fromSegLen);
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

  const { goalPick, best } = runDijkstraBetweenProjections(
    graph,
    from,
    to,
    rawFrom,
    rawTo,
    fromSegLen,
    toSegLen,
    config,
    queueImpl,
  );

  if (!goalPick) {
    if (from.wayId === to.wayId && from.segmentIndex === to.segmentIndex) {
      const direct = sameSegmentDirectRoute(from, to, fromSegLen, rawFrom);
      if (direct.forbidden) {
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
    }
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

  const res = buildResultFromGoal(graph, from, to, airDistanceM, goalPick, best);
  return finish(res);
}
