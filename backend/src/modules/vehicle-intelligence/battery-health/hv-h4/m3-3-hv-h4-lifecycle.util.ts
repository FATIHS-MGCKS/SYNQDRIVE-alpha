import { BatteryEvidenceScope } from '@prisma/client';
import {
  isHvH2GroundTruthActiveAtEvaluationAt,
  isHvH2GroundTruthKnowableAtEvaluationAt,
} from '../hv-h2/m3-3-hv-h2-ground-truth-asof.util';
import {
  buildM3_3HvH2LifecycleSegments,
  resolveLifecycleSegmentForObservedAt,
  type HvH2ReplacementBoundary,
} from '../hv-h2/m3-3-hv-h2-lifecycle-segmentation';
import type { M3_3HvH4LifecycleSegmentRefV1 } from './m3-3-hv-h4.types';

export interface M3_3HvH4GroundTruthRow {
  id: string;
  batteryScope: BatteryEvidenceScope;
  groundTruthType: string;
  effectiveAt: Date;
  createdAt: Date;
  verificationStatus: import('@prisma/client').BatteryGroundTruthVerificationStatus;
  revocations: readonly { revokedAt: Date }[];
  supersededByGroundTruthEvents: readonly { createdAt: Date }[];
}

export function resolveM3_3HvH4ReplacementBoundaries(
  events: M3_3HvH4GroundTruthRow[],
  evaluationAt: Date,
): HvH2ReplacementBoundary[] {
  return events
    .filter(
      (e) =>
        isHvH2GroundTruthKnowableAtEvaluationAt(e, evaluationAt) &&
        isHvH2GroundTruthActiveAtEvaluationAt(e, evaluationAt) &&
        e.batteryScope === BatteryEvidenceScope.HV &&
        e.groundTruthType === 'BATTERY_REPLACEMENT' &&
        e.effectiveAt.getTime() <= evaluationAt.getTime(),
    )
    .map((e) => ({
      effectiveAt: e.effectiveAt,
      groundTruthEventId: e.id,
    }));
}

export function buildM3_3HvH4LifecycleSegmentRefs(
  replacementBoundaries: HvH2ReplacementBoundary[],
): M3_3HvH4LifecycleSegmentRefV1[] {
  return buildM3_3HvH2LifecycleSegments(replacementBoundaries).map((s) => ({
    lifecycleSegmentId: s.lifecycleSegmentId,
    segmentIndex: s.segmentIndex,
    replacementBoundaryEffectiveAt: s.replacementBoundaryEffectiveAt,
  }));
}

export function resolveM3_3HvH4LifecycleSegmentForInstant(input: {
  instant: Date;
  replacementBoundaries: HvH2ReplacementBoundary[];
}): string {
  return resolveLifecycleSegmentForObservedAt({
    observedAt: input.instant,
    replacementBoundaries: input.replacementBoundaries,
  }).lifecycleSegmentId;
}

/** Per-segment temporal window for source coverage — [startInclusive, endExclusive) except final segment uses endInclusive = evaluationAt. */
export interface M3_3HvH4LifecycleSegmentInterval {
  lifecycleSegmentId: string;
  startInclusive: Date | null;
  endExclusive: Date | null;
  endInclusiveAtEvaluation: Date;
  isFinalSegment: boolean;
}

export function buildM3_3HvH4LifecycleSegmentIntervals(input: {
  replacementBoundaries: HvH2ReplacementBoundary[];
  evaluationAt: Date;
}): M3_3HvH4LifecycleSegmentInterval[] {
  const sorted = [...input.replacementBoundaries].sort(
    (a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime(),
  );
  const segmentCount = sorted.length + 1;
  const intervals: M3_3HvH4LifecycleSegmentInterval[] = [];
  for (let i = 0; i < segmentCount; i += 1) {
    const startInclusive = i === 0 ? null : sorted[i - 1]!.effectiveAt;
    const isFinalSegment = i === segmentCount - 1;
    const nextBoundary = i < sorted.length ? sorted[i]!.effectiveAt : null;
    intervals.push({
      lifecycleSegmentId: `HV_SEGMENT_${i}`,
      startInclusive,
      endExclusive: isFinalSegment ? null : nextBoundary,
      endInclusiveAtEvaluation: input.evaluationAt,
      isFinalSegment,
    });
  }
  return intervals;
}

export function instantWithinM3_3HvH4SegmentInterval(
  instant: Date,
  interval: M3_3HvH4LifecycleSegmentInterval,
): boolean {
  const t = instant.getTime();
  if (interval.startInclusive && t < interval.startInclusive.getTime()) {
    return false;
  }
  if (interval.endExclusive && t >= interval.endExclusive.getTime()) {
    return false;
  }
  if (interval.isFinalSegment) {
    return t <= interval.endInclusiveAtEvaluation.getTime();
  }
  return true;
}
