import type { ResearchGpsBucket, ResearchOsmWay } from './contracts';
import type { S4ResearchAlgorithmConfig } from './config';
import { buildWayAdjacency, nearestWayCandidates } from './osm-parse';
import type { BaselineBucketMatch } from './baseline-matching';
import type { InternalMatchOutcome } from './labels';
import {
  emissionCostFromHits,
  tieBreakWayId,
  transitionCost,
  type WayHit,
} from './viterbi-dp-costs';
import { S4_RESEARCH_VITERBI_BACKTRACK_ALGORITHM_ID } from './version';

type DpCell = {
  cost: number;
  prevIndex: number;
};

type LayerState = {
  wayId: number | null;
  cell: DpCell;
};

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

/** Lower = better. Tie-break: lower cost, then lower wayId, then lower prevIndex. */
function betterLayerState(a: LayerState, b: LayerState): boolean {
  if (a.cell.cost !== b.cell.cost) return a.cell.cost < b.cell.cost;
  const w = tieBreakWayId(a.wayId) - tieBreakWayId(b.wayId);
  if (w !== 0) return w < 0;
  return a.cell.prevIndex < b.cell.prevIndex;
}

export type ViterbiBacktrackSegmentMeta = {
  segmentIndex: number;
  bucketCount: number;
  tracebackEndCost: number;
  tracebackVerifiedPathCost: number;
};

export type ViterbiBacktrackResult = {
  algorithmId: string;
  matches: BaselineBucketMatch[];
  segments: ViterbiBacktrackSegmentMeta[];
  totalReportedPathCost: number;
};

/** Recompute transition+emission sum for the emitted way-id sequence (audit). */
export function verifyReportedPathCost(
  buckets: ResearchGpsBucket[],
  wayIds: Array<number | null>,
  ways: ResearchOsmWay[],
  headings: (number | null)[],
  config: S4ResearchAlgorithmConfig,
): number {
  const adj = buildWayAdjacency(ways);
  let total = 0;
  let prevWay: number | null = null;
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    if (b.availability !== 'PRESENT' || b.latitude == null || b.longitude == null) {
      prevWay = null;
      continue;
    }
    const wayId = wayIds[i] ?? null;
    const hits = nearestWayCandidates(
      b.latitude,
      b.longitude,
      ways,
      config.uncertaintyRadiusM,
      config.pointToSegmentDistanceM,
    ).slice(0, config.viterbiTopK);
    const e = wayId == null ? 100 : emissionCostFromHits(headings[i], wayId, hits, config);
    const t = transitionCost(prevWay, wayId, adj, b.l3SpeedKmh);
    total += t + e;
    prevWay = wayId;
  }
  return total;
}

function decodeSegment(
  segmentBuckets: ResearchGpsBucket[],
  segmentHeadings: (number | null)[],
  ways: ResearchOsmWay[],
  config: S4ResearchAlgorithmConfig,
  adj: Map<number, Set<number>>,
  segmentIndex: number,
): { matches: BaselineBucketMatch[]; meta: ViterbiBacktrackSegmentMeta } {
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

  for (let t = 0; t < segmentBuckets.length; t++) {
    const b = segmentBuckets[t];
    const hits = hitsPerStep[t];
    const candidates = candidateLists[t];
    const layerCur: LayerState[] = [];

    for (let ci = 0; ci < candidates.length; ci++) {
      const wayId = candidates[ci];
      let best: LayerState = { wayId, cell: { cost: Infinity, prevIndex: -1 } };
      for (let pi = 0; pi < layerPrev.length; pi++) {
        const prev = layerPrev[pi];
        const trans = transitionCost(prev.wayId, wayId, adj, b.l3SpeedKmh);
        const emit =
          wayId == null ? 100 : emissionCostFromHits(segmentHeadings[t], wayId, hits, config);
        const cand: LayerState = {
          wayId,
          cell: { cost: prev.cell.cost + trans + emit, prevIndex: pi },
        };
        if (best.cell.prevIndex === -1 || betterLayerState(cand, best)) {
          best = cand;
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

  const verified = verifyReportedPathCost(
    segmentBuckets,
    chosenWayIds,
    ways,
    segmentHeadings,
    config,
  );

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
      tracebackVerifiedPathCost: verified,
    },
  };
}

/**
 * Full backpointer Viterbi per contiguous GPS segment (resets across gaps).
 * Same emission/transition costs as FORWARD_V2; does not prune predecessor layers.
 */
export function buildViterbiMatchesBacktrackR1(
  buckets: ResearchGpsBucket[],
  ways: ResearchOsmWay[],
  headings: (number | null)[],
  config: S4ResearchAlgorithmConfig,
): ViterbiBacktrackResult {
  const adj = buildWayAdjacency(ways);
  const out: BaselineBucketMatch[] = [];
  const segments: ViterbiBacktrackSegmentMeta[] = [];
  let segBuckets: ResearchGpsBucket[] = [];
  let segHeadings: (number | null)[] = [];
  let segIndex = 0;

  const flushSegment = () => {
    if (segBuckets.length === 0) return;
    const { matches, meta } = decodeSegment(segBuckets, segHeadings, ways, config, adj, segIndex);
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
    algorithmId: S4_RESEARCH_VITERBI_BACKTRACK_ALGORITHM_ID,
    matches: out,
    segments,
    totalReportedPathCost,
  };
}
