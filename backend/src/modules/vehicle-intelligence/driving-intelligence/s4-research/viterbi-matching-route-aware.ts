import type { ResearchGpsBucket, ResearchOsmWay } from './contracts';
import type { S4ResearchAlgorithmConfig } from './config';
import { nearestWayCandidates } from './osm-parse';
import type { BaselineBucketMatch } from './baseline-matching';
import type { InternalMatchOutcome } from './labels';
import { emissionCostFromHits, tieBreakWayId, type WayHit } from './viterbi-dp-costs';
import { S4_RESEARCH_ROUTE_AWARE_VITERBI_R1 } from './version';
import type { DirectedCarRoutingGraph } from './osm-directed-routing-graph';
import {
  computeRouteAwareTransitionCost,
  type RouteAwareTransitionCostParts,
} from './route-aware-transition';
import type { S4RouteAwareResearchConfig } from './route-aware-config';
import { DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG } from './route-aware-config';
import { clearRouteQueryCache } from './route-query';

type DpCell = { cost: number; prevIndex: number };
type LayerState = { wayId: number | null; cell: DpCell };

function outcomeForChoice(
  chosenWayId: number | null,
  hits: WayHit[],
  config: S4ResearchAlgorithmConfig,
): InternalMatchOutcome {
  if (chosenWayId == null) return 'UNKNOWN';
  const h = hits.filter((x) => x.way.osmWayId === chosenWayId);
  if (h.length === 0) return 'UNKNOWN';
  if (hits.length > 1 && hits[1].distanceM - hits[0].distanceM < config.competitorGapM) {
    return 'AMBIGUOUS';
  }
  return 'CONFIRMED';
}

function betterLayerState(a: LayerState, b: LayerState): boolean {
  if (a.cell.cost !== b.cell.cost) return a.cell.cost < b.cell.cost;
  const w = tieBreakWayId(a.wayId) - tieBreakWayId(b.wayId);
  if (w !== 0) return w < 0;
  return a.cell.prevIndex < b.cell.prevIndex;
}

export type RouteAwareSegmentMeta = {
  segmentIndex: number;
  bucketCount: number;
  tracebackEndCost: number;
  transitionCostPartsSum: RouteAwareTransitionCostParts;
};

export type RouteAwareViterbiResult = {
  algorithmId: string;
  matches: BaselineBucketMatch[];
  segments: RouteAwareSegmentMeta[];
  totalReportedPathCost: number;
};

function transitionBetween(
  graph: DirectedCarRoutingGraph,
  waysById: Map<number, ResearchOsmWay>,
  prevBucket: ResearchGpsBucket | null,
  curBucket: ResearchGpsBucket,
  prevWayId: number | null,
  curWayId: number | null,
  config: S4ResearchAlgorithmConfig,
  routeConfig: S4RouteAwareResearchConfig,
): { cost: number; parts: RouteAwareTransitionCostParts | null } {
  if (prevWayId == null || curWayId == null) {
    const base = prevWayId === curWayId ? 0 : 5;
    return {
      cost: base,
      parts: null,
    };
  }
  if (prevWayId === curWayId) {
    const parts = computeRouteAwareTransitionCost(
      graph,
      prevBucket!,
      curBucket,
      waysById.get(prevWayId)!,
      waysById.get(curWayId)!,
      config,
      routeConfig,
    );
    return { cost: parts.total, parts };
  }
  const parts = computeRouteAwareTransitionCost(
    graph,
    prevBucket!,
    curBucket,
    waysById.get(prevWayId)!,
    waysById.get(curWayId)!,
    config,
    routeConfig,
  );
  return { cost: parts.total, parts };
}

function decodeSegmentRouteAware(
  segmentBuckets: ResearchGpsBucket[],
  segmentHeadings: (number | null)[],
  ways: ResearchOsmWay[],
  config: S4ResearchAlgorithmConfig,
  graph: DirectedCarRoutingGraph,
  routeConfig: S4RouteAwareResearchConfig,
  segmentIndex: number,
): { matches: BaselineBucketMatch[]; meta: RouteAwareSegmentMeta } {
  const waysById = new Map(ways.map((w) => [w.osmWayId, w]));
  const TOP_K = config.viterbiTopK;
  const hitsPerStep: WayHit[][] = [];
  const candidateLists: Array<Array<number | null>> = [];

  for (let i = 0; i < segmentBuckets.length; i++) {
    const b = segmentBuckets[i];
    const hits = nearestWayCandidates(
      b.latitude!,
      b.longitude!,
      ways,
      config.uncertaintyRadiusM,
      config.pointToSegmentDistanceM,
    ).slice(0, TOP_K);
    hitsPerStep.push(hits);
    candidateLists.push([...hits.map((h) => h.way.osmWayId), null]);
  }

  let layerPrev: LayerState[] = [{ wayId: null, cell: { cost: 0, prevIndex: -1 } }];
  const layers: LayerState[][] = [];
  const transitionPartsTrace: RouteAwareTransitionCostParts[] = [];

  for (let t = 0; t < segmentBuckets.length; t++) {
    const b = segmentBuckets[t];
    const hits = hitsPerStep[t];
    const candidates = candidateLists[t];
    const layerCur: LayerState[] = [];
    const prevBucket = t > 0 ? segmentBuckets[t - 1] : null;

    for (let ci = 0; ci < candidates.length; ci++) {
      const wayId = candidates[ci];
      let best: LayerState = { wayId, cell: { cost: Infinity, prevIndex: -1 } };
      for (let pi = 0; pi < layerPrev.length; pi++) {
        const prev = layerPrev[pi];
        const { cost: trans, parts } = transitionBetween(
          graph,
          waysById,
          prevBucket,
          b,
          prev.wayId,
          wayId,
          config,
          routeConfig,
        );
        if (parts && t > 0 && pi === 0 && ci === 0) {
          // sample parts only for meta aggregation (full sum recomputed on traceback)
        }
        const emit =
          wayId == null ? 100 : emissionCostFromHits(segmentHeadings[t], wayId, hits, config);
        const cand: LayerState = {
          wayId,
          cell: { cost: prev.cell.cost + trans + emit, prevIndex: pi },
        };
        if (best.cell.prevIndex === -1 || betterLayerState(cand, best)) {
          best = cand;
          if (parts) transitionPartsTrace.push(parts);
        }
      }
      layerCur.push(best);
    }
    layers.push(layerCur);
    layerPrev = layerCur;
  }

  let endIdx = 0;
  for (let i = 1; i < layerPrev.length; i++) {
    if (betterLayerState(layerPrev[i], layerPrev[endIdx])) endIdx = i;
  }
  const tracebackEndCost = layerPrev[endIdx]!.cell.cost;

  const chosenWayIds: Array<number | null> = new Array(segmentBuckets.length);
  let curIdx = endIdx;
  for (let t = segmentBuckets.length - 1; t >= 0; t--) {
    const entry = layers[t][curIdx]!;
    chosenWayIds[t] = entry.wayId;
    curIdx = entry.cell.prevIndex;
  }

  const partsSum: RouteAwareTransitionCostParts = {
    routeDistanceM: 0,
    airDistanceM: 0,
    elapsedSec: null,
    requiredAverageSpeedKmh: null,
    referenceSpeedKmh: null,
    routeDistanceCost: 0,
    timePlausibilityCost: 0,
    topologyUncertaintyCost: 0,
    directionChangeCost: 0,
    statusPenalty: 0,
    total: 0,
    status: 'CONNECTED_AND_DIRECTION_ALLOWED',
    turnRestrictionUnknown: false,
  };

  for (let t = 1; t < segmentBuckets.length; t++) {
    const pw = chosenWayIds[t - 1];
    const cw = chosenWayIds[t];
    if (pw == null || cw == null) continue;
    const { parts } = transitionBetween(
      graph,
      waysById,
      segmentBuckets[t - 1],
      segmentBuckets[t],
      pw,
      cw,
      config,
      routeConfig,
    );
    if (!parts) continue;
    partsSum.routeDistanceM += parts.routeDistanceM;
    partsSum.airDistanceM += parts.airDistanceM;
    partsSum.routeDistanceCost += parts.routeDistanceCost;
    partsSum.timePlausibilityCost += parts.timePlausibilityCost;
    partsSum.topologyUncertaintyCost += parts.topologyUncertaintyCost;
    partsSum.directionChangeCost += parts.directionChangeCost;
    partsSum.statusPenalty += parts.statusPenalty;
    partsSum.total += parts.total;
    if (parts.turnRestrictionUnknown) partsSum.turnRestrictionUnknown = true;
  }

  const matches: BaselineBucketMatch[] = [];
  for (let i = 0; i < segmentBuckets.length; i++) {
    const b = segmentBuckets[i];
    const hits = hitsPerStep[i]!;
    const chosenWayId = chosenWayIds[i]!;
    const outcome = outcomeForChoice(chosenWayId, hits, config);
    matches.push({
      bucketLabelUtc: b.bucketLabelUtc,
      gpsStatus: 'PRESENT',
      headingDeg: segmentHeadings[i],
      outcome,
      osmWayId: chosenWayId,
      candidateWayIds: hits.map((h) => h.way.osmWayId),
      ambiguityReasons: outcome === 'AMBIGUOUS' ? ['VITERBI_COMPETING_OR_HIGH_COST'] : [],
      nearestConfirmedJunctionM: null,
      confirmedJunctionNodeId: null,
      trafficSignalNodeId: null,
      trafficSignalDistanceM: null,
    });
  }

  return {
    matches,
    meta: {
      segmentIndex,
      bucketCount: segmentBuckets.length,
      tracebackEndCost,
      transitionCostPartsSum: partsSum,
    },
  };
}

/**
 * Backtrack Viterbi with route-aware directed-graph transition costs (research only).
 * Emission model unchanged from FORWARD_V2 / BACKTRACK_R1.
 */
export function buildViterbiMatchesRouteAwareR1(
  buckets: ResearchGpsBucket[],
  ways: ResearchOsmWay[],
  headings: (number | null)[],
  config: S4ResearchAlgorithmConfig,
  graph: DirectedCarRoutingGraph,
  routeConfig: S4RouteAwareResearchConfig = DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG,
): RouteAwareViterbiResult {
  clearRouteQueryCache();
  const out: BaselineBucketMatch[] = [];
  const segments: RouteAwareSegmentMeta[] = [];
  let segBuckets: ResearchGpsBucket[] = [];
  let segHeadings: (number | null)[] = [];
  let segIndex = 0;

  const flushSegment = () => {
    if (segBuckets.length === 0) return;
    const { matches, meta } = decodeSegmentRouteAware(
      segBuckets,
      segHeadings,
      ways,
      config,
      graph,
      routeConfig,
      segIndex,
    );
    out.push(...matches);
    segments.push(meta);
    segIndex += 1;
    segBuckets = [];
    segHeadings = [];
  };

  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    if (b.availability !== 'PRESENT' || b.latitude == null || b.longitude == null) {
      flushSegment();
      out.push({
        bucketLabelUtc: b.bucketLabelUtc,
        gpsStatus: b.availability,
        headingDeg: null,
        outcome: 'UNKNOWN',
        osmWayId: null,
        candidateWayIds: [],
        ambiguityReasons: ['NO_GPS'],
        nearestConfirmedJunctionM: null,
        confirmedJunctionNodeId: null,
        trafficSignalNodeId: null,
        trafficSignalDistanceM: null,
      });
      continue;
    }
    segBuckets.push(b);
    segHeadings.push(headings[i]);
  }
  flushSegment();

  const totalReportedPathCost = segments.reduce((s, m) => s + m.tracebackEndCost, 0);
  return {
    algorithmId: S4_RESEARCH_ROUTE_AWARE_VITERBI_R1,
    matches: out,
    segments,
    totalReportedPathCost,
  };
}
