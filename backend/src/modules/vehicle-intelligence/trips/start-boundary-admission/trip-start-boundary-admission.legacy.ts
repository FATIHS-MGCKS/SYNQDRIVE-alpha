import type { DimoTripSegment } from '../../../dimo/dimo-segments.service';
import { selectConfirmedStartSegment } from '../start-boundary-window.util';
import type { LegacySegmentStartBoundaryResult } from './trip-start-boundary-admission.types';

/**
 * Pure mirror of the production DIMO-segment branch in
 * `TripDetectionOrchestrationService.resolveConfirmedStartBoundary` (no movement corroboration).
 */
export function resolveLegacySegmentStartBoundary(input: {
  segments: DimoTripSegment[];
  candidateStartAt: Date;
  confirmedAt: Date;
}): LegacySegmentStartBoundaryResult | null {
  const matchingSegment = selectConfirmedStartSegment(
    input.segments,
    input.candidateStartAt,
    input.confirmedAt,
  );
  if (!matchingSegment) return null;

  const startAt = new Date(matchingSegment.startTime);
  return {
    startAt,
    source: 'DIMO_SEGMENT',
    adjustedMs: startAt.getTime() - input.candidateStartAt.getTime(),
    dimoSegmentId: matchingSegment.segmentId,
  };
}
