import type { ResearchGpsBucket, ResearchOsmWay } from './contracts';
import type { S4ResearchAlgorithmConfig } from './config';
import type { DirectedCarRoutingGraph } from './osm-directed-routing-graph';
import { nearestWayCandidates } from './osm-parse';
import type { BaselineBucketMatch } from './baseline-matching';
import { emissionCostFromHits, type WayHit } from './viterbi-dp-costs';
import { computeRouteAwareTransitionCost } from './route-aware-transition';
import type { S4RouteAwareResearchConfig } from './route-aware-config';
import { DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG } from './route-aware-config';

export type NullStateAuditRow = {
  bucketLabelUtc: string;
  nullCost: number;
  bestNonNullWayId: number | null;
  bestNonNullTotalCost: number | null;
  bestNonNullEmission: number | null;
  bestNonNullTransition: number | null;
  bestNonNullRouteStatus: string | null;
  costDeltaToNull: number | null;
  classification: 'EVIDENCE_GAP' | 'ROUTE_SEARCH_FAILURE' | 'COST_MODEL_BIAS' | 'TOPOLOGY_INCOMPLETE' | 'UNKNOWN';
};

export function auditNullStateChoicesOnTrace(
  buckets: ResearchGpsBucket[],
  matches: BaselineBucketMatch[],
  headings: (number | null)[],
  ways: ResearchOsmWay[],
  graph: DirectedCarRoutingGraph,
  config: S4ResearchAlgorithmConfig,
  routeConfig: S4RouteAwareResearchConfig = DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG,
): NullStateAuditRow[] {
  const waysById = new Map(ways.map((w) => [w.osmWayId, w]));
  const rows: NullStateAuditRow[] = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const b = buckets[i];
    if (b.availability !== 'PRESENT' || b.latitude == null || b.longitude == null) continue;
    if (m.osmWayId != null) continue;

    const hits = nearestWayCandidates(
      b.latitude,
      b.longitude,
      ways,
      config.uncertaintyRadiusM,
      config.pointToSegmentDistanceM,
    ).slice(0, config.viterbiTopK);
    const nullCost = 100;

    let bestWay: number | null = null;
    let bestTotal = Infinity;
    let bestEmit: number | null = null;
    let bestTrans: number | null = null;
    let bestStatus: string | null = null;

    const prev = i > 0 ? matches[i - 1] : null;
    const prevBucket = i > 0 ? buckets[i - 1] : null;

    for (const h of hits) {
      const emit = emissionCostFromHits(headings[i], h.way.osmWayId, hits as WayHit[], config);
      let trans = 0;
      let status: string | null = 'SAME_STEP';
      if (prev?.osmWayId != null && prevBucket && prevBucket.availability === 'PRESENT') {
        const parts = computeRouteAwareTransitionCost(
          graph,
          prevBucket,
          b,
          waysById.get(prev.osmWayId)!,
          h.way,
          config,
          routeConfig,
        );
        trans = parts.total;
        status = parts.status;
      }
      const total = emit + trans;
      if (total < bestTotal) {
        bestTotal = total;
        bestWay = h.way.osmWayId;
        bestEmit = emit;
        bestTrans = trans;
        bestStatus = status;
      }
    }

    let classification: NullStateAuditRow['classification'] = 'UNKNOWN';
    if (hits.length === 0) classification = 'EVIDENCE_GAP';
    else if (bestStatus === 'ROUTE_NOT_FOUND_IN_EXTRACT' || bestStatus === 'TOPOLOGY_INCOMPLETE') {
      classification = 'TOPOLOGY_INCOMPLETE';
    } else if (bestStatus === 'DIRECTION_FORBIDDEN') {
      classification = 'ROUTE_SEARCH_FAILURE';
    } else if (bestTotal < nullCost) classification = 'COST_MODEL_BIAS';
    else if (bestTotal >= nullCost) classification = 'COST_MODEL_BIAS';

    rows.push({
      bucketLabelUtc: b.bucketLabelUtc,
      nullCost,
      bestNonNullWayId: bestWay,
      bestNonNullTotalCost: bestWay == null ? null : bestTotal,
      bestNonNullEmission: bestEmit,
      bestNonNullTransition: bestTrans,
      bestNonNullRouteStatus: bestStatus,
      costDeltaToNull: bestWay == null ? null : bestTotal - nullCost,
      classification,
    });
  }
  return rows;
}
