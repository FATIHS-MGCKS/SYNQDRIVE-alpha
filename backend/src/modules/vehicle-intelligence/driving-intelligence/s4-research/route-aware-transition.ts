import type { ResearchGpsBucket } from './contracts';
import type { S4ResearchAlgorithmConfig } from './config';
import type { DirectedCarRoutingGraph, RouteTopologyStatus } from './osm-directed-routing-graph';
import type { S4RouteAwareResearchConfig } from './route-aware-config';
import { DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG } from './route-aware-config';
import { queryRouteBetweenProjections } from './route-query';
import type { WaySegmentProjection } from './route-segment-projection';
import type { ResearchOsmWay } from './contracts';
import { projectBucketOntoWay } from './route-segment-projection';
import type { RawOsmWay } from './osm-parse';

export type RouteAwareTransitionCostParts = {
  routeDistanceM: number;
  airDistanceM: number;
  elapsedSec: number | null;
  requiredAverageSpeedKmh: number | null;
  referenceSpeedKmh: number | null;
  routeDistanceCost: number;
  timePlausibilityCost: number;
  topologyUncertaintyCost: number;
  directionChangeCost: number;
  statusPenalty: number;
  total: number;
  status: RouteTopologyStatus;
  turnRestrictionUnknown: boolean;
};

function bucketElapsedSec(prev: ResearchGpsBucket, cur: ResearchGpsBucket): number | null {
  const a = Date.parse(prev.bucketLabelUtc);
  const b = Date.parse(cur.bucketLabelUtc);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const sec = (b - a) / 1000;
  return sec > 0 ? sec : null;
}

function sameWayDirectionForbidden(
  raw: RawOsmWay | undefined,
  from: WaySegmentProjection,
  to: WaySegmentProjection,
): boolean {
  if (!raw || from.wayId !== to.wayId) return false;
  const ow = raw.tags.oneway;
  if (ow !== 'yes' && ow !== '-1') return false;
  const delta = to.fractionAlongSegment - from.fractionAlongSegment;
  if (Math.abs(delta) < 1e-6) return false;
  if (ow === 'yes' && delta < 0) return true;
  if (ow === '-1' && delta > 0) return true;
  return false;
}

export function computeRouteAwareTransitionCost(
  graph: DirectedCarRoutingGraph,
  prevBucket: ResearchGpsBucket,
  curBucket: ResearchGpsBucket,
  prevWay: ResearchOsmWay,
  curWay: ResearchOsmWay,
  _config: S4ResearchAlgorithmConfig,
  routeConfig: S4RouteAwareResearchConfig = DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG,
): RouteAwareTransitionCostParts {
  const rawPrev = graph.rawWaysById.get(prevWay.osmWayId);
  const rawCur = graph.rawWaysById.get(curWay.osmWayId);
  const fromProj = projectBucketOntoWay(prevBucket, prevWay, rawPrev?.nodeIds ?? null);
  const toProj = projectBucketOntoWay(curBucket, curWay, rawCur?.nodeIds ?? null);

  if (!fromProj || !toProj) {
    return {
      routeDistanceM: 0,
      airDistanceM: 0,
      elapsedSec: bucketElapsedSec(prevBucket, curBucket),
      requiredAverageSpeedKmh: null,
      referenceSpeedKmh: curBucket.l3SpeedKmh ?? null,
      routeDistanceCost: 0,
      timePlausibilityCost: 0,
      topologyUncertaintyCost: routeConfig.weightTopologyUncertainty,
      directionChangeCost: 0,
      statusPenalty: routeConfig.penaltyRouteNotFound,
      total: routeConfig.penaltyRouteNotFound + routeConfig.weightTopologyUncertainty,
      status: 'TOPOLOGY_INCOMPLETE',
      turnRestrictionUnknown: !graph.turnRestrictionRelationsPresent,
    };
  }

  if (sameWayDirectionForbidden(rawPrev, fromProj, toProj)) {
    const elapsedSec = bucketElapsedSec(prevBucket, curBucket);
    return {
      routeDistanceM: 0,
      airDistanceM: 0,
      elapsedSec,
      requiredAverageSpeedKmh: null,
      referenceSpeedKmh: curBucket.l3SpeedKmh ?? null,
      routeDistanceCost: 0,
      timePlausibilityCost: 0,
      topologyUncertaintyCost: 0,
      directionChangeCost: 0,
      statusPenalty: routeConfig.penaltyDirectionForbidden,
      total: routeConfig.penaltyDirectionForbidden,
      status: 'DIRECTION_FORBIDDEN',
      turnRestrictionUnknown: false,
    };
  }

  const route = queryRouteBetweenProjections(graph, fromProj, toProj, routeConfig);
  const elapsedSec = bucketElapsedSec(prevBucket, curBucket);
  const requiredAverageSpeedKmh =
    elapsedSec != null && elapsedSec > 0 ? (route.routeDistanceM / elapsedSec) * 3.6 : null;

  let referenceSpeedKmh: number | null = null;
  if (curBucket.l3SpeedKmh != null && curBucket.l3SpeedKmh >= routeConfig.l3MinTrustSpeedKmh) {
    referenceSpeedKmh = curBucket.l3SpeedKmh;
  } else if (prevBucket.l3SpeedKmh != null && prevBucket.l3SpeedKmh >= routeConfig.l3MinTrustSpeedKmh) {
    referenceSpeedKmh = prevBucket.l3SpeedKmh;
  }

  const maxPlausibleKmh =
    referenceSpeedKmh != null
      ? referenceSpeedKmh * routeConfig.l3SpeedSlackFactor
      : routeConfig.fallbackMaxPlausibleSpeedKmh;

  let timePlausibilityCost = 0;
  if (requiredAverageSpeedKmh != null && requiredAverageSpeedKmh > maxPlausibleKmh) {
    timePlausibilityCost =
      routeConfig.weightTimeViolationPerKmh * (requiredAverageSpeedKmh - maxPlausibleKmh);
  }

  const routeDistanceCost = routeConfig.weightRouteDistancePerM * route.routeDistanceM;
  const topologyUncertaintyCost = route.topologyUncertainty ? routeConfig.weightTopologyUncertainty : 0;
  const directionChangeCost = routeConfig.weightDirectionChange * route.directionChanges;

  let statusPenalty = 0;
  if (route.status === 'DIRECTION_FORBIDDEN') statusPenalty = routeConfig.penaltyDirectionForbidden;
  else if (route.status === 'ROUTE_NOT_FOUND_IN_EXTRACT') statusPenalty = routeConfig.penaltyRouteNotFound;
  else if (route.status === 'TOPOLOGY_INCOMPLETE') statusPenalty = routeConfig.penaltyRouteNotFound;

  const total =
    routeDistanceCost + timePlausibilityCost + topologyUncertaintyCost + directionChangeCost + statusPenalty;

  return {
    routeDistanceM: route.routeDistanceM,
    airDistanceM: route.airDistanceM,
    elapsedSec,
    requiredAverageSpeedKmh,
    referenceSpeedKmh,
    routeDistanceCost,
    timePlausibilityCost,
    topologyUncertaintyCost,
    directionChangeCost,
    statusPenalty,
    total,
    status: route.status,
    turnRestrictionUnknown: route.turnRestrictionUnknown,
  };
}
