import type { ResearchGpsBucket } from './contracts';
import type { BaselineBucketMatch } from './baseline-matching';
import { headingDeltaDeg } from './geo';
import { nearestWayCandidates } from './osm-parse';
import type { S4ResearchAlgorithmConfig } from './config';
import { toPublicHypothesis } from './labels';
import type { WayCandidateEvidence } from './contracts';

export type PromotionDecisionClass =
  | 'TOPOLOGY_PLAUSIBLE'
  | 'STILL_AMBIGUOUS'
  | 'STRUCTURALLY_CONTRADICTED'
  | 'INSUFFICIENT_EVIDENCE';

export function buildWayCandidateDetails(
  lat: number,
  lon: number,
  headingDeg: number | null,
  ways: import('./contracts').ResearchOsmWay[],
  config: S4ResearchAlgorithmConfig,
): WayCandidateEvidence[] {
  const hits = nearestWayCandidates(lat, lon, ways, config.uncertaintyRadiusM);
  const nearestDist = hits[0]?.distanceM ?? null;
  return hits.slice(0, 8).map((h) => {
    const bearingDeltaDeg =
      headingDeg != null && h.segmentBearingDeg != null
        ? headingDeltaDeg(headingDeg, h.segmentBearingDeg)
        : null;
    return {
      osmWayId: h.way.osmWayId,
      distanceM: h.distanceM,
      segmentBearingDeg: h.segmentBearingDeg,
      bearingDeltaDeg,
      highway: h.way.highway,
      oneway: h.way.oneway,
      within5mOfNearest: nearestDist != null && h.distanceM - nearestDist < config.competitorGapM,
    };
  });
}

export function dualCarriagewayAmbiguity(params: {
  baselineAmbiguityReasons: string[];
  chosenWayId: number | null;
  candidates: WayCandidateEvidence[];
  bearingCompatDeg: number;
}): boolean {
  if (params.chosenWayId == null) return false;
  const bearingOnly = params.baselineAmbiguityReasons.every((r) => r.startsWith('BEARING_MISMATCH'));
  if (!bearingOnly) return false;
  const chosen = params.candidates.find((c) => c.osmWayId === params.chosenWayId);
  if (!chosen?.highway) return false;
  const sameClass = params.candidates.filter(
    (c) => c.highway === chosen.highway && c.distanceM <= chosen.distanceM + 12,
  );
  if (sameClass.length < 2) return false;
  const aligned = sameClass.filter(
    (c) => c.bearingDeltaDeg != null && c.bearingDeltaDeg <= params.bearingCompatDeg,
  );
  const opposed = sameClass.filter(
    (c) => c.bearingDeltaDeg != null && c.bearingDeltaDeg >= 180 - params.bearingCompatDeg,
  );
  return aligned.length >= 1 && opposed.length >= 1;
}

export function classifyAmbiguousPromotion(params: {
  bucket: ResearchGpsBucket;
  baseline: BaselineBucketMatch;
  viterbi: BaselineBucketMatch;
  candidates: WayCandidateEvidence[];
  graphContinuityFromPrev: boolean | null;
  parallelCarriagewayHint: boolean;
  config: S4ResearchAlgorithmConfig;
}): { decisionClass: PromotionDecisionClass; rationale: string[] } {
  const rationale: string[] = [];
  const { bucket, baseline, viterbi, candidates, graphContinuityFromPrev, parallelCarriagewayHint } =
    params;

  if (bucket.availability !== 'PRESENT' || bucket.latitude == null) {
    rationale.push('GPS_NOT_PRESENT');
    return { decisionClass: 'INSUFFICIENT_EVIDENCE', rationale };
  }

  const basePub = toPublicHypothesis(baseline.outcome);
  const vitPub = toPublicHypothesis(viterbi.outcome);
  if (basePub !== 'AMBIGUOUS' || vitPub !== 'ASSOCIATED') {
    rationale.push('NOT_AN_AMBIGUOUS_TO_ASSOCIATED_PROMOTION');
    return { decisionClass: 'INSUFFICIENT_EVIDENCE', rationale };
  }

  if (graphContinuityFromPrev === false) {
    rationale.push('VITERBI_GRAPH_DISCONTINUITY');
    return { decisionClass: 'STRUCTURALLY_CONTRADICTED', rationale };
  }

  if (parallelCarriagewayHint || dualCarriagewayAmbiguity({
    baselineAmbiguityReasons: baseline.ambiguityReasons,
    chosenWayId: viterbi.osmWayId,
    candidates,
    bearingCompatDeg: params.config.bearingCompatDeg,
  })) {
    rationale.push('PARALLEL_OR_DUAL_CARRIAGEWAY_BEARING_AMBIGUITY_REMAINS');
    return { decisionClass: 'STILL_AMBIGUOUS', rationale };
  }

  const competitorsWithin5m = candidates.filter((c) => c.within5mOfNearest).length;
  if (competitorsWithin5m >= 2) {
    rationale.push('COMPETING_WAYS_WITHIN_5M');
    return { decisionClass: 'STILL_AMBIGUOUS', rationale };
  }

  if (graphContinuityFromPrev === true) {
    rationale.push('GRAPH_ADJACENT_VITERBI_CONTINUITY');
    return { decisionClass: 'TOPOLOGY_PLAUSIBLE', rationale };
  }

  rationale.push('INSUFFICIENT_TOPOLOGY_OR_GAP_CONTEXT');
  return { decisionClass: 'INSUFFICIENT_EVIDENCE', rationale };
}
