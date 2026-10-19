import { haversineMeters } from '../speed-qc/di-v0-speed-qc-geo';
import type { DirectedCarRoutingGraph, RouteTopologyStatus } from './osm-directed-routing-graph';
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

type DijkstraState = {
  nodeId: number;
  costM: number;
  prevNode: number | null;
  incomingWayId: number | null;
  directionChanges: number;
  turnUnknown: boolean;
};

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

export function clearRouteQueryCache(graph?: DirectedCarRoutingGraph): void {
  if (graph) cacheByGraph.delete(graph);
}

function compareState(a: DijkstraState, b: DijkstraState): number {
  if (a.costM !== b.costM) return a.costM - b.costM;
  if (a.nodeId !== b.nodeId) return a.nodeId - b.nodeId;
  return (a.incomingWayId ?? 0) - (b.incomingWayId ?? 0);
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

  if (from.startNodeId == null || from.endNodeId == null || to.startNodeId == null || to.endNodeId == null) {
    const res: RouteQueryResult = {
      status: 'TOPOLOGY_INCOMPLETE',
      airDistanceM,
      routeDistanceM: airDistanceM,
      directionChanges: 0,
      topologyUncertainty: true,
      turnRestrictionUnknown: false,
      nodePath: [],
      waySegments: [],
      computeMs: performance.now() - t0,
    };
    cache.set(key, res);
    return res;
  }

  const rawFrom = graph.rawWaysById.get(from.wayId);
  const rawTo = graph.rawWaysById.get(to.wayId);
  const fromSegLen = segmentLengthForProjection(graph, from);
  const toSegLen = segmentLengthForProjection(graph, to);

  if (from.wayId === to.wayId && from.segmentIndex === to.segmentIndex) {
    const delta = to.fractionAlongSegment - from.fractionAlongSegment;
    const routeDistanceM = Math.abs(fromSegLen * delta);
    const rules = rawFrom?.tags.oneway;
    const forbidden =
      (rules === 'yes' && delta < 0) ||
      (rules === '-1' && delta > 0) ||
      (rawFrom?.tags.junction === 'roundabout' && delta < 0);
    const res: RouteQueryResult = {
      status: forbidden ? 'DIRECTION_FORBIDDEN' : 'CONNECTED_AND_DIRECTION_ALLOWED',
      airDistanceM,
      routeDistanceM,
      directionChanges: 0,
      topologyUncertainty: false,
      turnRestrictionUnknown: false,
      nodePath: [from.startNodeId, from.endNodeId],
      waySegments: [{ wayId: from.wayId, segmentIndex: from.segmentIndex }],
      computeMs: performance.now() - t0,
    };
    cache.set(key, res);
    return res;
  }

  const startAttachments = departureAttachments(from, rawFrom, fromSegLen);
  const goalNodeIds = [to.startNodeId, to.endNodeId];

  if (startAttachments.length === 0) {
    const res: RouteQueryResult = {
      status: 'DIRECTION_FORBIDDEN',
      airDistanceM,
      routeDistanceM: airDistanceM,
      directionChanges: 0,
      topologyUncertainty: false,
      turnRestrictionUnknown: false,
      nodePath: [],
      waySegments: [],
      computeMs: performance.now() - t0,
    };
    cache.set(key, res);
    return res;
  }

  const best = new Map<number, DijkstraState>();
  const queue: DijkstraState[] = [];

  for (const s of startAttachments) {
    const st: DijkstraState = {
      nodeId: s.nodeId,
      costM: s.linkCostM,
      prevNode: null,
      incomingWayId: null,
      directionChanges: 0,
      turnUnknown: junctionTurnRestrictionUnknown(graph, s.nodeId),
    };
    const prev = best.get(s.nodeId);
    if (!prev || compareState(st, prev) < 0) {
      best.set(s.nodeId, st);
      queue.push(st);
    }
  }

  let expansions = 0;
  type GoalPick = { state: DijkstraState; tailM: number; totalM: number };
  let bestGoal: GoalPick | null = null;

  const considerGoal = (state: DijkstraState) => {
    for (const goalNode of goalNodeIds) {
      const tail = arrivalTailCostM(to, rawTo, toSegLen, goalNode);
      if (tail == null) continue;
      const totalM = state.costM + tail;
      if (totalM > config.maxRouteDistanceM) continue;
      if (!bestGoal || totalM < bestGoal.totalM) {
        bestGoal = { state, tailM: tail, totalM };
      } else if (bestGoal && totalM === bestGoal.totalM) {
        if (compareState(state, bestGoal.state) < 0) {
          bestGoal = { state, tailM: tail, totalM };
        }
      }
    }
  };

  while (queue.length > 0 && expansions < config.maxRoutingExpansions) {
    queue.sort(compareState);
    const cur = queue.shift()!;
    expansions += 1;
    const known = best.get(cur.nodeId);
    if (!known || compareState(known, cur) < 0) continue;
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
      const next: DijkstraState = {
        nodeId: edge.toNodeId,
        costM: cur.costM + edge.distanceM,
        prevNode: cur.nodeId,
        incomingWayId: edge.wayId,
        directionChanges: cur.directionChanges + (fromWay != null && fromWay !== toWay ? 1 : 0),
        turnUnknown: cur.turnUnknown || turnAtJunction,
      };
      const prev = best.get(edge.toNodeId);
      if (!prev || compareState(next, prev) < 0) {
        best.set(edge.toNodeId, next);
        queue.push(next);
      }
    }
  }

  // P4: evaluate all frontier goal arrivals (multi-target with tails)
  for (const state of best.values()) {
    considerGoal(state);
  }

  const computeMs = performance.now() - t0;

  if (!bestGoal) {
    const res: RouteQueryResult = {
      status: 'ROUTE_NOT_FOUND_IN_EXTRACT',
      airDistanceM,
      routeDistanceM: airDistanceM,
      directionChanges: 0,
      topologyUncertainty: true,
      turnRestrictionUnknown: false,
      nodePath: [],
      waySegments: [],
      computeMs,
    };
    cache.set(key, res);
    return res;
  }

  const goalPick: GoalPick = bestGoal;
  const found = goalPick.state;
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

  if (from.wayId !== to.wayId && waySegments.length === 0) {
    const res: RouteQueryResult = {
      status: 'ROUTE_NOT_FOUND_IN_EXTRACT',
      airDistanceM,
      routeDistanceM: airDistanceM,
      directionChanges: 0,
      topologyUncertainty: true,
      turnRestrictionUnknown: false,
      nodePath: [],
      waySegments: [],
      computeMs,
    };
    cache.set(key, res);
    return res;
  }

  const res: RouteQueryResult = {
    status: found.turnUnknown ? 'TURN_RESTRICTION_UNKNOWN' : 'CONNECTED_AND_DIRECTION_ALLOWED',
    airDistanceM,
    routeDistanceM: goalPick.totalM,
    directionChanges: found.directionChanges,
    topologyUncertainty: found.turnUnknown,
    turnRestrictionUnknown: found.turnUnknown,
    nodePath,
    waySegments,
    computeMs,
  };
  cache.set(key, res);
  return res;
}
