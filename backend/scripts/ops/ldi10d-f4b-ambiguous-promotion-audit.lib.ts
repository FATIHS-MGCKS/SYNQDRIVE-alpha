/**
 * LDI-10D F4-B — ambiguous → ASSOCIATED promotion evidence audit (offline research).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadCommittedFixture, type FixtureBucket } from './ldi10d-phase3c2-tesla-gps-fixture.lib';
import {
  BEARING_COMPAT_DEG,
  DEFAULT_UNCERTAINTY_RADIUS_M,
  nearestWayCandidates,
  type OsmWay,
} from './ldi10d-phase2-osm-road-context.lib';
import { buildWayAdjacency, loadTeslaOsmDoc } from './ldi10d-phase3e2-spatial-forensics.lib';
import {
  BASELINE_ASSOCIATED,
  BASELINE_AMBIGUOUS,
  BASELINE_UNKNOWN,
  buildTransitionMatrix,
  normalizeOutcome,
  verifyPhase3e3Preflight,
  type MatrixLabel,
} from './ldi10d-phase3e3-road-matching-accuracy.lib';
import {
  EVIDENCE_DIR_REL,
  buildTeslaBucketAssociations,
  buildTeslaTopologyContext,
  type RoadAssociationOutcome,
  type TeslaBucketAssociation,
} from './ldi10d-phase3e1-tesla-osm-spatial.lib';

export const F4B_EXPECTED_PROMOTIONS = 36;
export const F4B_EXPECTED_AMBIG_TO_UNKNOWN = 119;
export const F4B_EXPECTED_BASELINE_ASSOCIATED_STABLE = 264;

export type PromotionDecisionClass =
  | 'TOPOLOGY_PLAUSIBLE'
  | 'STILL_AMBIGUOUS'
  | 'STRUCTURALLY_CONTRADICTED'
  | 'INSUFFICIENT_EVIDENCE';

export type WayCandidateDetail = {
  osmWayId: number;
  distanceM: number;
  segmentBearingDeg: number | null;
  bearingDeltaDeg: number | null;
  highway: string | null;
  oneway: string | null;
  within5mOfNearest: boolean;
};

export type ViterbiStepDetail = {
  chosenWayId: number | null;
  totalCost: number;
  emissionCost: number;
  transitionCost: number;
  prevWayId: number | null;
  runnerUpWayId: number | null;
  runnerUpTotalCost: number | null;
  costMarginToRunnerUp: number | null;
  selectionSummary: string;
};

export type PromotionBucketRecord = {
  bucketIndex: number;
  bucketLabelUtc: string;
  lat: number | null;
  lon: number | null;
  headingDeg: number | null;
  qcTrustLevel: string;
  l3Kmh: number | null;
  baselineOutcome: MatrixLabel;
  candidateOutcome: MatrixLabel;
  baselineWayId: number | null;
  chosenOsmWayId: number | null;
  baselineCompetingWayIds: number[];
  viterbiTopKWayIds: number[];
  candidates: WayCandidateDetail[];
  competingWithin5m: boolean;
  competitorsWithin5mCount: number;
  parallelCarriagewayHint: boolean;
  chosenHighway: string | null;
  chosenTopologyNote: string;
  graphContinuityFromPrevViterbi: boolean | null;
  prevViterbiWayId: number | null;
  adjacentRowAbsent: { prev: boolean; next: boolean };
  baselineAmbiguityReasons: string[];
  decisionClass: PromotionDecisionClass;
  decisionRationale: string[];
  viterbi: ViterbiStepDetail;
};

export type ImpossibleTransitionRecord = {
  bucketIndex: number;
  bucketLabelUtc: string;
  prevBucketLabelUtc: string;
  prevWayId: number;
  curWayId: number;
  graphReachable: boolean;
  prevHighway: string | null;
  curHighway: string | null;
  reviewNote: string;
};

export type F4bAuditResult = {
  preflight: ReturnType<typeof verifyPhase3e3Preflight>;
  reproducibility: {
    promotionCount: number;
    ambiguousToUnknown: number;
    baselineAssociatedUnchanged: number;
    baselineAssociatedRowStable: boolean;
  };
  promotions: PromotionBucketRecord[];
  classDistribution: Record<PromotionDecisionClass, number>;
  competitorsWithin5mHistogram: Record<string, number>;
  impossibleTransitions: ImpossibleTransitionRecord[];
  recurringAmbiguityCauses: Array<{ cause: string; promotionHits: number }>;
  candidateCollapseAssessment: {
    justified: 'PARTIAL' | 'NO' | 'YES';
    riskSummary: string;
    goNoGo: 'GO_CONDITIONAL' | 'NO_GO' | 'GO';
    rationale: string[];
  };
  roadIdAccuracy: 'NOT_ASSESSABLE';
};

function headingDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function graphReachable(adj: Map<number, Set<number>>, a: number | null, b: number | null): boolean {
  if (a == null || b == null) return false;
  if (a === b) return true;
  return adj.get(a)?.has(b) ?? false;
}

function f4bEmissionCost(
  lat: number,
  lon: number,
  heading: number | null,
  wayId: number,
  ways: OsmWay[],
): number {
  const hits = nearestWayCandidates(lat, lon, ways, DEFAULT_UNCERTAINTY_RADIUS_M);
  const hit = hits.find((h) => h.way.osmId === wayId);
  if (!hit) return 1e6;
  let cost = hit.distanceM * 2;
  if (heading != null && hit.segmentBearingDeg != null) {
    const d = headingDelta(heading, hit.segmentBearingDeg);
    if (d > BEARING_COMPAT_DEG) cost += 50 + d;
  }
  return cost;
}

function f4bTransitionCost(
  prevWay: number | null,
  curWay: number | null,
  adj: Map<number, Set<number>>,
  speedKmh: number | null,
): number {
  if (prevWay == null || curWay == null) return prevWay === curWay ? 0 : 5;
  if (prevWay === curWay) return 0;
  if (adj.get(prevWay)?.has(curWay)) return 2;
  if (speedKmh != null && speedKmh > 80) return 80;
  return 40;
}

function viterbiForwardWithTrace(
  buckets: FixtureBucket[],
  ways: OsmWay[],
  headings: (number | null)[],
): { associations: TeslaBucketAssociation[]; trace: ViterbiStepDetail[] } {
  const adj = buildWayAdjacency(ways);
  const TOP_K = 4;
  const trace: ViterbiStepDetail[] = [];
  const out: TeslaBucketAssociation[] = [];
  let prevDp: Array<{ cost: number; wayId: number | null }> = [{ cost: 0, wayId: null }];

  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    if (b.availability !== 'PRESENT' || b.latitude == null || b.longitude == null) {
      trace.push({
        chosenWayId: null,
        totalCost: 0,
        emissionCost: 0,
        transitionCost: 0,
        prevWayId: null,
        runnerUpWayId: null,
        runnerUpTotalCost: null,
        costMarginToRunnerUp: null,
        selectionSummary: 'ROW_ABSENT_OR_NO_GPS',
      });
      out.push({
        bucketLabelUtc: b.bucketLabelUtc,
        lat: b.latitude,
        lon: b.longitude,
        gpsStatus: b.availability === 'ROW_ABSENT' ? 'ROW_ABSENT' : 'OTHER',
        headingDeg: null,
        outcome: 'UNKNOWN',
        osmWayId: null,
        candidateWayIds: [],
        ambiguityReasons: ['NO_GPS'],
        nearestConfirmedJunctionM: null,
        confirmedJunctionNodeId: null,
        trafficSignalNodeId: null,
        trafficSignalDistanceM: null,
        temporalContinuityWayId: null,
        provenance: ['phase3e2_viterbi_forward_v1'],
      });
      prevDp = [{ cost: 0, wayId: null }];
      continue;
    }

    const hits = nearestWayCandidates(b.latitude!, b.longitude!, ways, DEFAULT_UNCERTAINTY_RADIUS_M).slice(
      0,
      TOP_K,
    );
    const candidates: Array<number | null> = [...hits.map((h) => h.way.osmId), null];
    const scored: Array<{
      wayId: number | null;
      total: number;
      emission: number;
      transition: number;
      prevWayId: number | null;
    }> = [];

    for (const wayId of candidates) {
      let best = Infinity;
      let bestPrev: number | null = null;
      let bestT = 0;
      let bestE = 0;
      for (const prev of prevDp) {
        const t = f4bTransitionCost(prev.wayId, wayId, adj, b.pinnedProductionL3Kmh);
        const e = wayId == null ? 100 : f4bEmissionCost(b.latitude!, b.longitude!, headings[i], wayId, ways);
        const tot = prev.cost + t + e;
        if (tot < best) {
          best = tot;
          bestPrev = prev.wayId;
          bestT = t;
          bestE = e;
        }
      }
      scored.push({ wayId, total: best, emission: bestE, transition: bestT, prevWayId: bestPrev });
    }

    scored.sort((a, b) => a.total - b.total);
    const chosen = scored[0]!;
    const runner = scored[1] ?? null;
    const margin = runner ? runner.total - chosen.total : null;
    let selectionSummary = 'MIN_TOTAL_COST';
    if (chosen.wayId == null) selectionSummary = 'NULL_WAY_LOWEST_COST';
    else if (chosen.transition <= 2 && chosen.prevWayId != null) selectionSummary = 'GRAPH_ADJACENT_CONTINUITY';
    else if (margin != null && margin < 3) selectionSummary = 'NARROW_COST_MARGIN';

    trace.push({
      chosenWayId: chosen.wayId,
      totalCost: chosen.total,
      emissionCost: chosen.emission,
      transitionCost: chosen.transition,
      prevWayId: chosen.prevWayId,
      runnerUpWayId: runner?.wayId ?? null,
      runnerUpTotalCost: runner?.total ?? null,
      costMarginToRunnerUp: margin,
      selectionSummary,
    });

    let outcome: RoadAssociationOutcome = 'UNKNOWN';
    if (chosen.wayId != null) {
      const h = hits.filter((x) => x.way.osmId === chosen.wayId);
      if (h.length === 0) outcome = 'UNKNOWN';
      else if (hits.length > 1 && hits[1].distanceM - hits[0].distanceM < 5) outcome = 'AMBIGUOUS';
      else outcome = 'CONFIRMED';
    }

    out.push({
      bucketLabelUtc: b.bucketLabelUtc,
      lat: b.latitude,
      lon: b.longitude,
      gpsStatus: 'PRESENT',
      headingDeg: headings[i],
      outcome,
      osmWayId: chosen.wayId,
      candidateWayIds: hits.map((h) => h.way.osmId),
      ambiguityReasons: outcome === 'AMBIGUOUS' ? ['VITERBI_COMPETING_OR_HIGH_COST'] : [],
      nearestConfirmedJunctionM: null,
      confirmedJunctionNodeId: null,
      trafficSignalNodeId: null,
      trafficSignalDistanceM: null,
      temporalContinuityWayId: chosen.wayId,
      provenance: ['phase3e2_viterbi_forward_v1'],
    });
    prevDp = scored.slice(0, TOP_K + 1).map((s) => ({ cost: s.total, wayId: s.wayId }));
  }
  return { associations: out, trace };
}

function wayTopologyNote(way: OsmWay | undefined): string {
  if (!way) return 'WAY_NOT_IN_EXTRACT';
  const parts = [`highway=${way.highway ?? 'unknown'}`];
  if (way.tags.bridge) parts.push(`bridge=${way.tags.bridge}`);
  if (way.tags.tunnel) parts.push(`tunnel=${way.tags.tunnel}`);
  if (way.tags.layer) parts.push(`layer=${way.tags.layer}`);
  if (way.oneway) parts.push(`oneway=${way.oneway}`);
  if (way.tags.junction) parts.push(`junction=${way.tags.junction}`);
  return parts.join('; ');
}

function dualCarriagewayAmbiguity(params: {
  baseline: TeslaBucketAssociation;
  chosenWayId: number | null;
  candidates: WayCandidateDetail[];
}): boolean {
  if (params.chosenWayId == null) return false;
  const bearingOnly = params.baseline.ambiguityReasons.every((r) => r.startsWith('BEARING_MISMATCH'));
  if (!bearingOnly) return false;
  const chosen = params.candidates.find((c) => c.osmWayId === params.chosenWayId);
  if (!chosen?.highway) return false;
  const sameClass = params.candidates.filter(
    (c) => c.highway === chosen.highway && c.distanceM <= chosen.distanceM + 12,
  );
  if (sameClass.length < 2) return false;
  const aligned = sameClass.filter(
    (c) => c.bearingDeltaDeg != null && c.bearingDeltaDeg <= BEARING_COMPAT_DEG,
  );
  const opposed = sameClass.filter(
    (c) => c.bearingDeltaDeg != null && c.bearingDeltaDeg >= 180 - BEARING_COMPAT_DEG,
  );
  return aligned.length >= 1 && opposed.length >= 1;
}

function classifyPromotion(params: {
  bucket: FixtureBucket;
  baseline: TeslaBucketAssociation;
  candidate: TeslaBucketAssociation;
  candidates: WayCandidateDetail[];
  competingWithin5m: boolean;
  competitorsWithin5mCount: number;
  parallelCarriagewayHint: boolean;
  graphContinuity: boolean | null;
  adjacentRowAbsent: { prev: boolean; next: boolean };
  viterbi: ViterbiStepDetail;
}): { decisionClass: PromotionDecisionClass; rationale: string[] } {
  const rationale: string[] = [];
  const { bucket, baseline, candidates, viterbi } = params;

  if (bucket.availability !== 'PRESENT' || bucket.latitude == null) {
    rationale.push('GPS_NOT_PRESENT');
    return { decisionClass: 'INSUFFICIENT_EVIDENCE', rationale };
  }
  if (params.adjacentRowAbsent.prev || params.adjacentRowAbsent.next) {
    rationale.push('ADJACENT_ROW_ABSENT_GAP');
  }
  if (bucket.qcTrustLevel !== 'TRUSTED' && bucket.qcTrustLevel !== 'TRUSTED_LIMITED') {
    rationale.push(`QC_${bucket.qcTrustLevel}`);
  }
  if (params.graphContinuity === false) {
    rationale.push('VITERBI_GRAPH_DISCONTINUITY_FROM_PREV_ASSOCIATED');
    return { decisionClass: 'STRUCTURALLY_CONTRADICTED', rationale };
  }
  if (
    baseline.headingDeg == null &&
    rationale.some((r) => r.startsWith('QC_')) &&
    params.adjacentRowAbsent.prev
  ) {
    return { decisionClass: 'INSUFFICIENT_EVIDENCE', rationale };
  }

  const chosen = candidates.find((c) => c.osmWayId === params.candidate.osmWayId);
  if (chosen?.bearingDeltaDeg != null && chosen.bearingDeltaDeg > BEARING_COMPAT_DEG) {
    rationale.push(`CHOSEN_BEARING_DELTA_${chosen.bearingDeltaDeg.toFixed(0)}`);
    return { decisionClass: 'STRUCTURALLY_CONTRADICTED', rationale };
  }

  if (baseline.ambiguityReasons.some((r) => r.includes('COMPETING_WAYS'))) {
    rationale.push('BASELINE_COMPETING_WAYS_WITHIN_5M');
    return { decisionClass: 'STILL_AMBIGUOUS', rationale };
  }

  if (params.competingWithin5m) {
    rationale.push(`SPATIAL_COMPETITORS_${params.competitorsWithin5mCount}_WITHIN_5M_GAP`);
    if (params.parallelCarriagewayHint) rationale.push('DISTINCT_HIGHWAY_CLASS_MIX');
    if (viterbi.selectionSummary === 'NARROW_COST_MARGIN') rationale.push('NARROW_VITERBI_MARGIN');
    return { decisionClass: 'STILL_AMBIGUOUS', rationale };
  }

  if (
    dualCarriagewayAmbiguity({
      baseline,
      chosenWayId: params.candidate.osmWayId,
      candidates,
    })
  ) {
    rationale.push('OPPOSING_PARALLEL_CARRIAGEWAY_SET_WITHOUT_ROAD_ID_GT');
    return { decisionClass: 'STILL_AMBIGUOUS', rationale };
  }

  if (rationale.includes('ADJACENT_ROW_ABSENT_GAP') || rationale.some((r) => r.startsWith('QC_'))) {
    return { decisionClass: 'INSUFFICIENT_EVIDENCE', rationale };
  }

  if (viterbi.selectionSummary === 'GRAPH_ADJACENT_CONTINUITY' || params.graphContinuity === true) {
    rationale.push('TEMPORAL_GRAPH_CONTINUITY_SUPPORTS_PICK');
  }
  if (chosen && chosen.distanceM <= 15) rationale.push('REASONABLE_SNAP_DISTANCE');
  return { decisionClass: 'TOPOLOGY_PLAUSIBLE', rationale };
}

function countCompetitorsWithin5m(hits: Array<{ distanceM: number }>): number {
  if (hits.length < 2) return hits.length > 0 ? 1 : 0;
  const d0 = hits[0].distanceM;
  if (hits[1].distanceM - d0 >= 5) return 1;
  return hits.filter((h) => h.distanceM - d0 < 5).length;
}

function parallelCarriagewayHint(candidates: WayCandidateDetail[]): boolean {
  const highways = new Set(candidates.filter((c) => c.within5mOfNearest).map((c) => c.highway ?? ''));
  return highways.size >= 2 && highways.has('service') !== highways.has('motorway');
}

export function runF4bAmbiguousPromotionAudit(repoRoot: string): F4bAuditResult {
  const preflight = verifyPhase3e3Preflight(repoRoot);
  const fixture = loadCommittedFixture(repoRoot);
  const topoCtx = buildTeslaTopologyContext(loadTeslaOsmDoc(repoRoot).doc);
  const ways = topoCtx.ways;
  const wayById = new Map(ways.map((w) => [w.osmId, w]));
  const adj = buildWayAdjacency(ways);

  const assocPath = path.join(repoRoot, EVIDENCE_DIR_REL, 'LDI10D_PHASE3E1_TESLA_SPATIAL_ASSOCIATION.json');
  const baselineAssoc = (
    JSON.parse(fs.readFileSync(assocPath, 'utf8')) as { associations: TeslaBucketAssociation[] }
  ).associations;

  const recomputed = buildTeslaBucketAssociations(fixture.buckets, topoCtx);
  const headings = recomputed.map((a) => a.headingDeg);
  const { associations: candidateAssoc, trace: viterbiTrace } = viterbiForwardWithTrace(
    fixture.buckets,
    ways,
    headings,
  );

  const baselineLabels = baselineAssoc.map((b) => normalizeOutcome(b.outcome));
  const candidateLabels = candidateAssoc.map((c) => normalizeOutcome(c.outcome));
  const transition = buildTransitionMatrix(baselineLabels, candidateLabels);

  const promotionCount = transition.matrix.AMBIGUOUS.ASSOCIATED;
  const ambiguousToUnknown = transition.matrix.AMBIGUOUS.UNKNOWN;
  const baselineAssociatedUnchanged = transition.matrix.ASSOCIATED.ASSOCIATED;

  const promotions: PromotionBucketRecord[] = [];
  for (let i = 0; i < fixture.buckets.length; i++) {
    const bl = baselineLabels[i];
    const cl = candidateLabels[i];
    if (bl !== 'AMBIGUOUS' || cl !== 'ASSOCIATED') continue;

    const bucket = fixture.buckets[i];
    const baseline = baselineAssoc[i];
    const candidate = candidateAssoc[i];
    const hits = bucket.latitude != null && bucket.longitude != null
      ? nearestWayCandidates(bucket.latitude, bucket.longitude, ways, DEFAULT_UNCERTAINTY_RADIUS_M)
      : [];
    const nearestDist = hits[0]?.distanceM ?? null;
    const candidates: WayCandidateDetail[] = hits.slice(0, 8).map((h) => ({
      osmWayId: h.way.osmId,
      distanceM: h.distanceM,
      segmentBearingDeg: h.segmentBearingDeg,
      bearingDeltaDeg:
        baseline.headingDeg != null && h.segmentBearingDeg != null
          ? headingDelta(baseline.headingDeg, h.segmentBearingDeg)
          : null,
      highway: h.way.highway,
      oneway: h.way.oneway,
      within5mOfNearest: nearestDist != null && h.distanceM - nearestDist < 5,
    }));
    const competingWithin5m = hits.length > 1 && hits[1].distanceM - hits[0].distanceM < 5;
    const competitorsWithin5mCount = countCompetitorsWithin5m(hits);
    const prevCand = i > 0 ? candidateAssoc[i - 1] : null;
    const prevWay = prevCand?.osmWayId ?? null;
    const graphContinuity =
      prevCand && normalizeOutcome(prevCand.outcome) === 'ASSOCIATED' && candidate.osmWayId != null
        ? graphReachable(adj, prevWay, candidate.osmWayId)
        : prevWay == null
          ? null
          : graphReachable(adj, prevWay, candidate.osmWayId);

    const { decisionClass, rationale } = classifyPromotion({
      bucket,
      baseline,
      candidate,
      candidates,
      competingWithin5m,
      competitorsWithin5mCount,
      parallelCarriagewayHint: parallelCarriagewayHint(candidates),
      graphContinuity,
      adjacentRowAbsent: {
        prev: i > 0 && fixture.buckets[i - 1].availability === 'ROW_ABSENT',
        next: i < fixture.buckets.length - 1 && fixture.buckets[i + 1].availability === 'ROW_ABSENT',
      },
      viterbi: viterbiTrace[i],
    });

    const chosenWay = candidate.osmWayId != null ? wayById.get(candidate.osmWayId) : undefined;
    promotions.push({
      bucketIndex: i,
      bucketLabelUtc: bucket.bucketLabelUtc,
      lat: bucket.latitude,
      lon: bucket.longitude,
      headingDeg: baseline.headingDeg,
      qcTrustLevel: bucket.qcTrustLevel,
      l3Kmh: bucket.pinnedProductionL3Kmh,
      baselineOutcome: bl,
      candidateOutcome: cl,
      baselineWayId: baseline.osmWayId,
      chosenOsmWayId: candidate.osmWayId,
      baselineCompetingWayIds: baseline.candidateWayIds,
      viterbiTopKWayIds: candidate.candidateWayIds,
      candidates,
      competingWithin5m,
      competitorsWithin5mCount,
      parallelCarriagewayHint: parallelCarriagewayHint(candidates),
      chosenHighway: chosenWay?.highway ?? null,
      chosenTopologyNote: wayTopologyNote(chosenWay),
      graphContinuityFromPrevViterbi: graphContinuity,
      prevViterbiWayId: prevWay,
      adjacentRowAbsent: {
        prev: i > 0 && fixture.buckets[i - 1].availability === 'ROW_ABSENT',
        next: i < fixture.buckets.length - 1 && fixture.buckets[i + 1].availability === 'ROW_ABSENT',
      },
      baselineAmbiguityReasons: baseline.ambiguityReasons,
      decisionClass,
      decisionRationale: rationale,
      viterbi: viterbiTrace[i],
    });
  }

  const classDistribution: Record<PromotionDecisionClass, number> = {
    TOPOLOGY_PLAUSIBLE: 0,
    STILL_AMBIGUOUS: 0,
    STRUCTURALLY_CONTRADICTED: 0,
    INSUFFICIENT_EVIDENCE: 0,
  };
  for (const p of promotions) classDistribution[p.decisionClass] += 1;

  const competitorsWithin5mHistogram: Record<string, number> = {};
  for (const p of promotions) {
    const k = String(p.competitorsWithin5mCount);
    competitorsWithin5mHistogram[k] = (competitorsWithin5mHistogram[k] ?? 0) + 1;
  }

  const impossibleTransitions: ImpossibleTransitionRecord[] = [];
  for (let i = 1; i < candidateAssoc.length; i++) {
    const a = candidateAssoc[i - 1];
    const b = candidateAssoc[i];
    if (
      a.osmWayId != null &&
      b.osmWayId != null &&
      a.osmWayId !== b.osmWayId &&
      !graphReachable(adj, a.osmWayId, b.osmWayId) &&
      normalizeOutcome(b.outcome) === 'ASSOCIATED'
    ) {
      const prevWay = wayById.get(a.osmWayId);
      const curWay = wayById.get(b.osmWayId);
      const isPromotionBucket = promotions.some((p) => p.bucketIndex === i);
      impossibleTransitions.push({
        bucketIndex: i,
        bucketLabelUtc: fixture.buckets[i].bucketLabelUtc,
        prevBucketLabelUtc: fixture.buckets[i - 1].bucketLabelUtc,
        prevWayId: a.osmWayId,
        curWayId: b.osmWayId,
        graphReachable: false,
        prevHighway: prevWay?.highway ?? null,
        curHighway: curWay?.highway ?? null,
        reviewNote: isPromotionBucket
          ? 'Promotion bucket on implausible graph hop — temporal prior may dominate emission.'
          : 'Non-promotion ASSOCIATED hop — Viterbi continuity cost tradeoff.',
      });
    }
  }

  const causeHits = new Map<string, number>();
  const bump = (c: string) => causeHits.set(c, (causeHits.get(c) ?? 0) + 1);
  for (const p of promotions) {
    for (const r of p.baselineAmbiguityReasons) bump(r);
    if (p.competingWithin5m) bump('COMPETING_WAYS_WITHIN_5M');
    if (p.parallelCarriagewayHint) bump('PARALLEL_HIGHWAY_CLASS_MIX');
    if (p.viterbi.selectionSummary === 'GRAPH_ADJACENT_CONTINUITY') bump('VITERBI_GRAPH_CONTINUITY_WIN');
    if (p.viterbi.selectionSummary === 'NARROW_COST_MARGIN') bump('NARROW_VITERBI_COST_MARGIN');
  }
  const recurringAmbiguityCauses = [...causeHits.entries()]
    .map(([cause, promotionHits]) => ({ cause, promotionHits }))
    .sort((a, b) => b.promotionHits - a.promotionHits);

  const stillAmb = classDistribution.STILL_AMBIGUOUS;
  const contradicted = classDistribution.STRUCTURALLY_CONTRADICTED;
  const plausible = classDistribution.TOPOLOGY_PLAUSIBLE;
  const goRationale: string[] = [];
  let goNoGo: 'GO_CONDITIONAL' | 'NO_GO' | 'GO' = 'GO_CONDITIONAL';
  if (contradicted > 0 || impossibleTransitions.length >= 5) {
    goRationale.push(`${impossibleTransitions.length} implausible graph hops in Viterbi ASSOCIATED chain.`);
  }
  if (stillAmb > promotions.length * 0.4) {
    goRationale.push(
      `${stillAmb}/${promotions.length} promotions remain STILL_AMBIGUOUS after topology-only review.`,
    );
  }
  let collapseJustified: 'PARTIAL' | 'NO' | 'YES' = 'PARTIAL';
  if (stillAmb + contradicted > plausible) collapseJustified = 'NO';
  else if (plausible > stillAmb * 2) collapseJustified = 'PARTIAL';

  if (stillAmb > promotions.length * 0.5) {
    goNoGo = 'NO_GO';
    collapseJustified = 'NO';
    goRationale.push(
      'Blind topology-based candidate collapse is not justified; require independent road-ID evidence or owner map review before further F4 matcher work.',
    );
  } else if (plausible >= promotions.length * 0.5 && contradicted <= 2) {
    goNoGo = 'GO_CONDITIONAL';
    goRationale.push('Majority topology-plausible; continue F4 only with topology guards and no accuracy claims.');
  } else if (contradicted > 5) {
    goNoGo = 'NO_GO';
    goRationale.push('Too many contradicted promotions for blind candidate collapse.');
  }

  if (
    promotionCount !== F4B_EXPECTED_PROMOTIONS ||
    ambiguousToUnknown !== F4B_EXPECTED_AMBIG_TO_UNKNOWN ||
    baselineAssociatedUnchanged !== F4B_EXPECTED_BASELINE_ASSOCIATED_STABLE
  ) {
    goNoGo = 'NO_GO';
    goRationale.push('Reproducibility gate failed — do not extend algorithm until fixtures realign.');
  }

  return {
    preflight,
    reproducibility: {
      promotionCount,
      ambiguousToUnknown,
      baselineAssociatedUnchanged,
      baselineAssociatedRowStable:
        transition.matrix.ASSOCIATED.AMBIGUOUS === 0 && transition.matrix.ASSOCIATED.UNKNOWN === 0,
    },
    promotions,
    classDistribution,
    competitorsWithin5mHistogram,
    impossibleTransitions,
    recurringAmbiguityCauses,
    candidateCollapseAssessment: {
      justified: collapseJustified,
      riskSummary:
        'Topology-only collapse on parallel carriageways, ramps, and service roads remains high-risk without independent road-ID ground truth.',
      goNoGo,
      rationale: goRationale,
    },
    roadIdAccuracy: 'NOT_ASSESSABLE',
  };
}

export function promotionsToCsvRows(promotions: PromotionBucketRecord[]): string {
  const header = [
    'bucketLabelUtc',
    'chosenOsmWayId',
    'decisionClass',
    'competingWithin5m',
    'competitorsWithin5mCount',
    'graphContinuityFromPrevViterbi',
    'chosenHighway',
    'qcTrustLevel',
    'adjacentRowAbsentPrev',
    'adjacentRowAbsentNext',
    'viterbiTotalCost',
    'viterbiTransitionCost',
    'viterbiEmissionCost',
    'viterbiSelectionSummary',
    'baselineAmbiguityReasons',
    'decisionRationale',
  ].join(',');
  const lines = promotions.map((p) =>
    [
      p.bucketLabelUtc,
      p.chosenOsmWayId ?? '',
      p.decisionClass,
      p.competingWithin5m,
      p.competitorsWithin5mCount,
      p.graphContinuityFromPrevViterbi ?? '',
      p.chosenHighway ?? '',
      p.qcTrustLevel,
      p.adjacentRowAbsent.prev,
      p.adjacentRowAbsent.next,
      p.viterbi.totalCost.toFixed(2),
      p.viterbi.transitionCost.toFixed(2),
      p.viterbi.emissionCost.toFixed(2),
      p.viterbi.selectionSummary,
      p.baselineAmbiguityReasons.join('|'),
      p.decisionRationale.join('|'),
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  );
  return [header, ...lines].join('\n');
}

export {
  BASELINE_ASSOCIATED,
  BASELINE_AMBIGUOUS,
  BASELINE_UNKNOWN,
  F4B_EXPECTED_PROMOTIONS as EXPECTED_PROMOTIONS,
};
