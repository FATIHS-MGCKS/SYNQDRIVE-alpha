import type { ResearchGpsBucket, ResearchOsmWay } from './contracts';
import type { S4ResearchAlgorithmConfig } from './config';
import { buildWayAdjacency, nearestWayCandidates } from './osm-parse';
import type { BaselineBucketMatch } from './baseline-matching';
import type { InternalMatchOutcome } from './labels';
import { transitionCost } from './viterbi-dp-costs';
import { emissionCostFromHitsDirectionAwareP1 } from './emission-direction-aware-p1';
import type { ViterbiTopologyOptions } from './viterbi-matching';
import { S4_RESEARCH_VITERBI_DIRECTION_AWARE_EMISSION_P1 } from './version';

export const DIRECTION_AWARE_EMISSION_P1_ALGORITHM_ID = S4_RESEARCH_VITERBI_DIRECTION_AWARE_EMISSION_P1;

/**
 * Forward Viterbi with direction-aware P1 emission (research only).
 * Same DP structure as `buildViterbiMatches`; only emission function differs.
 */
export function buildViterbiMatchesDirectionAwareEmissionP1(
  buckets: ResearchGpsBucket[],
  ways: ResearchOsmWay[],
  headings: (number | null)[],
  config: S4ResearchAlgorithmConfig,
  topology?: ViterbiTopologyOptions,
): BaselineBucketMatch[] {
  const adj = topology?.wayAdjacency ?? buildWayAdjacency(ways);
  const TOP_K = config.viterbiTopK;
  const out: BaselineBucketMatch[] = [];
  let prevDp: Array<{ cost: number; wayId: number | null }> = [{ cost: 0, wayId: null }];

  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    if (b.availability !== 'PRESENT' || b.latitude == null || b.longitude == null) {
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
      prevDp = [{ cost: 0, wayId: null }];
      continue;
    }

    const hits = nearestWayCandidates(
      b.latitude,
      b.longitude,
      ways,
      config.uncertaintyRadiusM,
      config.pointToSegmentDistanceM,
    ).slice(0, TOP_K);
    const candidates: Array<number | null> = [...hits.map((h) => h.way.osmWayId), null];
    const curDp: Array<{ cost: number; wayId: number | null }> = [];

    for (const wayId of candidates) {
      let best = Infinity;
      for (const prev of prevDp) {
        const t = transitionCost(prev.wayId, wayId, adj, b.l3SpeedKmh);
        const e =
          wayId == null ? 100 : emissionCostFromHitsDirectionAwareP1(headings[i], wayId, hits, config);
        best = Math.min(best, prev.cost + t + e);
      }
      curDp.push({ cost: best, wayId });
    }

    curDp.sort((a, b) => a.cost - b.cost);
    const chosen = curDp[0]!;
    let outcome: InternalMatchOutcome = 'UNKNOWN';
    if (chosen.wayId != null) {
      if (hits.length > 1 && hits[1].distanceM - hits[0].distanceM < config.competitorGapM) {
        outcome = 'AMBIGUOUS';
      } else outcome = 'CONFIRMED';
    }

    out.push({
      bucketLabelUtc: b.bucketLabelUtc,
      gpsStatus: 'PRESENT',
      headingDeg: headings[i],
      outcome,
      osmWayId: chosen.wayId,
      candidateWayIds: hits.map((h) => h.way.osmWayId),
      ambiguityReasons: outcome === 'AMBIGUOUS' ? ['VITERBI_COMPETING_OR_HIGH_COST'] : [],
      nearestConfirmedJunctionM: null,
      confirmedJunctionNodeId: null,
      trafficSignalNodeId: null,
      trafficSignalDistanceM: null,
    });
    prevDp = curDp.slice(0, TOP_K + 1);
  }
  return out;
}
