import type { ResearchGpsBucket, ResearchOsmWay } from './contracts';
import type { S4ResearchAlgorithmConfig } from './config';
import { headingDeltaDeg } from './geo';
import { buildWayAdjacency, nearestWayCandidates } from './osm-parse';
import type { BaselineBucketMatch } from './baseline-matching';
import type { InternalMatchOutcome } from './labels';

type WayHit = {
  way: ResearchOsmWay;
  distanceM: number;
  segmentBearingDeg: number | null;
};

function emissionCostFromHits(
  heading: number | null,
  wayId: number,
  hits: WayHit[],
  config: S4ResearchAlgorithmConfig,
): number {
  const hit = hits.find((h) => h.way.osmWayId === wayId);
  if (!hit) return 1e6;
  let cost = hit.distanceM * 2;
  if (heading != null && hit.segmentBearingDeg != null) {
    const d = headingDeltaDeg(heading, hit.segmentBearingDeg);
    if (d > config.bearingCompatDeg) cost += 50 + d;
  }
  return cost;
}

function transitionCost(
  prevWay: number | null,
  curWay: number | null,
  adj: Map<number, Set<number>>,
  speedKmh: number | null | undefined,
): number {
  if (prevWay == null || curWay == null) return prevWay === curWay ? 0 : 5;
  if (prevWay === curWay) return 0;
  if (adj.get(prevWay)?.has(curWay)) return 2;
  if (speedKmh != null && speedKmh > 80) return 80;
  return 40;
}

/** Causal forward-only Viterbi (research-only; not for production authority). */
export function buildViterbiMatches(
  buckets: ResearchGpsBucket[],
  ways: ResearchOsmWay[],
  headings: (number | null)[],
  config: S4ResearchAlgorithmConfig,
): BaselineBucketMatch[] {
  const adj = buildWayAdjacency(ways);
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

    const hits = nearestWayCandidates(b.latitude, b.longitude, ways, config.uncertaintyRadiusM).slice(
      0,
      TOP_K,
    );
    const candidates: Array<number | null> = [...hits.map((h) => h.way.osmWayId), null];
    const curDp: Array<{ cost: number; wayId: number | null }> = [];

    for (const wayId of candidates) {
      let best = Infinity;
      for (const prev of prevDp) {
        const t = transitionCost(prev.wayId, wayId, adj, b.l3SpeedKmh);
        const e = wayId == null ? 100 : emissionCostFromHits(headings[i], wayId, hits, config);
        best = Math.min(best, prev.cost + t + e);
      }
      curDp.push({ cost: best, wayId });
    }

    curDp.sort((a, b) => a.cost - b.cost);
    const chosen = curDp[0]!;
    let outcome: InternalMatchOutcome = 'UNKNOWN';
    if (chosen.wayId != null) {
      const h = hits.filter((x) => x.way.osmWayId === chosen.wayId);
      if (h.length === 0) outcome = 'UNKNOWN';
      else if (hits.length > 1 && hits[1].distanceM - hits[0].distanceM < config.competitorGapM) {
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

export function headingsFromBaseline(baseline: BaselineBucketMatch[]): (number | null)[] {
  return baseline.map((b) => b.headingDeg);
}
