import type { M3_3HvH2LifecycleSegmentV1 } from './m3-3-hv-h2.types';

export interface HvH2ReplacementBoundary {
  effectiveAt: Date;
  groundTruthEventId: string;
}

export function buildM3_3HvH2LifecycleSegments(
  replacementBoundaries: HvH2ReplacementBoundary[],
): M3_3HvH2LifecycleSegmentV1[] {
  const sorted = [...replacementBoundaries].sort(
    (a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime(),
  );
  const segments: M3_3HvH2LifecycleSegmentV1[] = [];
  for (let i = 0; i <= sorted.length; i += 1) {
    segments.push({
      lifecycleSegmentId: `HV_SEGMENT_${i}`,
      segmentIndex: i,
      replacementBoundaryEffectiveAt:
        i === 0 ? null : sorted[i - 1]!.effectiveAt.toISOString(),
    });
  }
  return segments;
}

export function resolveLifecycleSegmentForObservedAt(input: {
  observedAt: Date;
  replacementBoundaries: HvH2ReplacementBoundary[];
}): {
  lifecycleSegmentId: string;
  replacementBoundaryBeforeAt: string | null;
  replacementBoundaryAfterAt: string | null;
  onReplacementEffectiveAt: boolean;
} {
  const sorted = [...input.replacementBoundaries].sort(
    (a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime(),
  );
  const t = input.observedAt.getTime();
  let segmentIndex = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const boundary = sorted[i]!;
    const bt = boundary.effectiveAt.getTime();
    if (t === bt) {
      return {
        lifecycleSegmentId: `HV_SEGMENT_${i}`,
        replacementBoundaryBeforeAt:
          i > 0 ? sorted[i - 1]!.effectiveAt.toISOString() : null,
        replacementBoundaryAfterAt: boundary.effectiveAt.toISOString(),
        onReplacementEffectiveAt: true,
      };
    }
    if (t > bt) {
      segmentIndex = i + 1;
    }
  }
  const before =
    segmentIndex > 0 ? sorted[segmentIndex - 1]!.effectiveAt.toISOString() : null;
  const after =
    segmentIndex < sorted.length ? sorted[segmentIndex]!.effectiveAt.toISOString() : null;
  return {
    lifecycleSegmentId: `HV_SEGMENT_${segmentIndex}`,
    replacementBoundaryBeforeAt: before,
    replacementBoundaryAfterAt: after,
    onReplacementEffectiveAt: false,
  };
}

export function sessionCrossesReplacementBoundary(input: {
  sessionStartAt: Date;
  sessionEndAt: Date | null;
  replacementBoundaries: HvH2ReplacementBoundary[];
}): boolean {
  if (!input.sessionEndAt) return false;
  const start = input.sessionStartAt.getTime();
  const end = input.sessionEndAt.getTime();
  return input.replacementBoundaries.some((b) => {
    const bt = b.effectiveAt.getTime();
    return bt >= start && bt <= end;
  });
}
