import type {
  GraphTransitionConflict,
  RoadHypothesisLabel,
  RoadMatchingPipelineInput,
  RoadMatchingPipelineResult,
} from './contracts';
import { buildBaselineMatches } from './baseline-matching';
import { buildViterbiMatches, headingsFromBaseline } from './viterbi-matching';
import { buildViterbiMatchesDirectionAwareEmissionP1 } from './viterbi-matching-direction-aware-p1';
import { evidenceClassForHypothesis, toPublicHypothesis } from './labels';
import { buildWayAdjacency, graphReachable, nearestWayCandidates } from './osm-parse';
import {
  S4_RESEARCH_BASELINE_ALGORITHM_ID,
  S4_RESEARCH_VITERBI_ALGORITHM_ID,
  S4_RESEARCH_VITERBI_DIRECTION_AWARE_EMISSION_P1,
} from './version';
import { filterWaysToGpsCorridor } from './osm-parse';

const DEFAULT_CORRIDOR_MARGIN_M = 75;

function summarize(labels: RoadHypothesisLabel[]): Record<RoadHypothesisLabel, number> {
  const counts: Record<RoadHypothesisLabel, number> = { ASSOCIATED: 0, AMBIGUOUS: 0, UNKNOWN: 0 };
  for (const l of labels) counts[l] += 1;
  return counts;
}

export function detectGraphTransitionConflicts(
  viterbiWayIds: Array<{ bucketLabelUtc: string; wayId: number | null }>,
  ways: RoadMatchingPipelineInput['roadContext']['ways'],
): GraphTransitionConflict[] {
  const adj = buildWayAdjacency(ways);
  const conflicts: GraphTransitionConflict[] = [];
  for (let i = 1; i < viterbiWayIds.length; i++) {
    const prev = viterbiWayIds[i - 1];
    const cur = viterbiWayIds[i];
    if (prev.wayId == null || cur.wayId == null) continue;
    if (prev.wayId === cur.wayId) continue;
    const reachable = graphReachable(adj, prev.wayId, cur.wayId);
    if (!reachable) {
      conflicts.push({
        bucketLabelUtc: cur.bucketLabelUtc,
        prevBucketLabelUtc: prev.bucketLabelUtc,
        prevWayId: prev.wayId,
        curWayId: cur.wayId,
        graphReachable: false,
        reviewNote: 'Non-adjacent Viterbi way hop — topology conflict (not accuracy proof).',
      });
    }
  }
  return conflicts;
}

export function runRoadMatchingPipeline(input: RoadMatchingPipelineInput): RoadMatchingPipelineResult {
  const corridorWays = filterWaysToGpsCorridor(
    input.roadContext.ways,
    input.buckets,
    DEFAULT_CORRIDOR_MARGIN_M,
  );
  const roadContext = { ...input.roadContext, ways: corridorWays };
  const baselineInternal = buildBaselineMatches(input.buckets, roadContext, input.config);
  const headings = headingsFromBaseline(baselineInternal);
  const viterbiInternal = buildViterbiMatches(input.buckets, corridorWays, headings, input.config);
  const p1ShadowInternal = input.runDirectionAwareEmissionP1Shadow
    ? buildViterbiMatchesDirectionAwareEmissionP1(input.buckets, corridorWays, headings, input.config)
    : null;

  const viterbiWayTrack = viterbiInternal.map((v) => ({
    bucketLabelUtc: v.bucketLabelUtc,
    wayId: v.osmWayId,
  }));
  const allConflicts = detectGraphTransitionConflicts(viterbiWayTrack, corridorWays);
  const conflictByBucket = new Map(allConflicts.map((c) => [c.bucketLabelUtc, c]));

  const windows = input.buckets.map((b, i) => {
    const base = baselineInternal[i]!;
    const vit = viterbiInternal[i]!;
    const baseLabel = toPublicHypothesis(base.outcome);
    const vitLabel = toPublicHypothesis(vit.outcome);
    const hasGps = b.availability === 'PRESENT' && b.latitude != null;
    let topDist: number | null = null;
    if (hasGps && b.latitude != null && b.longitude != null) {
      const hits = nearestWayCandidates(
        b.latitude,
        b.longitude,
        corridorWays,
        input.config.uncertaintyRadiusM,
        input.config.pointToSegmentDistanceM,
      );
      topDist = hits[0]?.distanceM ?? null;
    }
    const conflict = conflictByBucket.get(b.bucketLabelUtc);
    const p1 = p1ShadowInternal?.[i];
    const p1Label = p1 ? toPublicHypothesis(p1.outcome) : null;
    return {
      bucketLabelUtc: b.bucketLabelUtc,
      gpsEvidenceState: b.availability,
      headingDeg: base.headingDeg,
      roadCandidateIds: base.candidateWayIds,
      baseline: {
        hypothesis: baseLabel,
        osmWayId: base.osmWayId,
        ambiguityReasons: base.ambiguityReasons,
        evidenceClassification: evidenceClassForHypothesis(baseLabel, hasGps),
      },
      viterbi: {
        hypothesis: vitLabel,
        osmWayId: vit.osmWayId,
        ambiguityReasons: vit.ambiguityReasons,
        evidenceClassification: evidenceClassForHypothesis(vitLabel, hasGps),
      },
      topologyEvidence: {
        nearestConfirmedJunctionM: base.nearestConfirmedJunctionM,
        confirmedJunctionNodeId: base.confirmedJunctionNodeId,
        trafficSignalNodeId: base.trafficSignalNodeId,
        trafficSignalDistanceM: base.trafficSignalDistanceM,
      },
      distanceHeadingEvidence: {
        topCandidateDistanceM: topDist,
        headingDeg: base.headingDeg,
      },
      graphTransitionConflicts: conflict ? [conflict] : [],
      independentAccuracy: 'NOT_ASSESSABLE' as const,
      ...(p1 && p1Label
        ? {
            nonAuthoritativeShadowDecoders: {
              directionAwareEmissionP1: {
                algorithmId: S4_RESEARCH_VITERBI_DIRECTION_AWARE_EMISSION_P1,
                hypothesis: p1Label,
                osmWayId: p1.osmWayId,
                ambiguityReasons: p1.ambiguityReasons,
                evidenceClassification: 'COMPUTATIONAL_CANDIDATE_ONLY' as const,
                authoritativeForProduct: false as const,
              },
            },
          }
        : {}),
    };
  });

  const baselineLabels = windows.map((w) => w.baseline.hypothesis);
  const viterbiLabels = windows.map((w) => w.viterbi.hypothesis);
  let changed = 0;
  for (let i = 0; i < windows.length; i++) {
    if (
      windows[i].baseline.hypothesis !== windows[i].viterbi.hypothesis ||
      windows[i].baseline.osmWayId !== windows[i].viterbi.osmWayId
    ) {
      changed += 1;
    }
  }

  let p1ShadowSummary: RoadMatchingPipelineResult['summary']['shadowDecoders'];
  if (p1ShadowInternal) {
    const p1Labels = p1ShadowInternal.map((r) => toPublicHypothesis(r.outcome));
    let changedVsV2 = 0;
    for (let i = 0; i < windows.length; i++) {
      if (
        windows[i].viterbi.hypothesis !== p1Labels[i] ||
        windows[i].viterbi.osmWayId !== p1ShadowInternal[i]!.osmWayId
      ) {
        changedVsV2 += 1;
      }
    }
    p1ShadowSummary = {
      directionAwareEmissionP1: {
        algorithmId: S4_RESEARCH_VITERBI_DIRECTION_AWARE_EMISSION_P1,
        labelCounts: summarize(p1Labels),
        bucketsChangedVsForwardViterbi: changedVsV2,
        authoritativeForProduct: false,
      },
    };
  }

  return {
    algorithmIds: {
      baseline: S4_RESEARCH_BASELINE_ALGORITHM_ID,
      viterbi: S4_RESEARCH_VITERBI_ALGORITHM_ID,
      ...(p1ShadowInternal
        ? { directionAwareEmissionP1Shadow: S4_RESEARCH_VITERBI_DIRECTION_AWARE_EMISSION_P1 }
        : {}),
    },
    windows,
    summary: {
      baseline: summarize(baselineLabels),
      viterbi: summarize(viterbiLabels),
      bucketsChanged: changed,
      graphTransitionConflicts: allConflicts.length,
      independentAccuracy: 'NOT_ASSESSABLE',
      ...(p1ShadowSummary ? { shadowDecoders: p1ShadowSummary } : {}),
    },
  };
}
