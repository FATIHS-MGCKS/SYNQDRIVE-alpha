import type { DimoTripSegment } from '../../../dimo/dimo-segments.service';
import {
  deriveTripStartBoundaryMaxLookbackMs,
  selectConfirmedStartSegment,
} from '../start-boundary-window.util';
import { findEarliestTrustedMovementInWindow } from './trip-start-boundary-admission.movement';
import type {
  EvidenceBackedStartBoundaryResult,
  MovementEvidenceCoverageState,
  MovementEvidenceSource,
  ResolveEvidenceBackedStartBoundaryInput,
} from './trip-start-boundary-admission.types';
import { normalizeSegmentDetectionMechanism } from './trip-start-boundary-admission.types';

const CLOCK_QUANTIZATION_NOTE =
  'Burned-in phone clock is second-quantized; overlay may lag container PTS by an unknown offset.';

function filterPointsInWindow<T extends { timestamp: string }>(
  points: T[],
  fromMs: number,
  toMs: number,
): T[] {
  return points.filter((p) => {
    const t = new Date(p.timestamp).getTime();
    return t >= fromMs && t <= toMs;
  });
}

function segmentAggregateActivitySources(
  segment: DimoTripSegment,
): MovementEvidenceSource[] {
  const sources: MovementEvidenceSource[] = [];
  if ((segment.distanceKm ?? 0) > 0.001) {
    sources.push('SEGMENT_DISTANCE');
  }
  if (
    segment.odometerStartKm != null &&
    segment.odometerEndKm != null &&
    segment.odometerEndKm > segment.odometerStartKm + 0.0005
  ) {
    sources.push('SEGMENT_ODOMETER');
  }
  if ((segment.maxSpeedKmh ?? 0) > 0.5) {
    sources.push('SEGMENT_MAX_SPEED');
  }
  return sources;
}

function classifyCoverage(
  prefixMovementAt: Date | null,
  segmentAggregateSources: MovementEvidenceSource[],
  coreRouteCount: number,
): MovementEvidenceCoverageState {
  if (prefixMovementAt != null) {
    return 'TRUSTED_MOVEMENT_PRESENT';
  }
  if (segmentAggregateSources.length > 0) {
    return 'SEGMENT_AGGREGATE_ACTIVITY_ONLY';
  }
  if (coreRouteCount > 0) {
    return 'FREQUENCY_ONLY';
  }
  return 'NO_DATA_IN_WINDOW';
}

function resolveProviderPrefixAdmission(input: {
  providerSegmentStartAt: Date;
  candidateStartAt: Date;
  prefixMovementAt: Date | null;
}):
  | { kind: 'ADMIT_PROVIDER' }
  | { kind: 'BOUND_EARLY'; at: Date }
  | { kind: 'UNCORROBORATED' } {
  if (input.prefixMovementAt == null) {
    return { kind: 'UNCORROBORATED' };
  }

  const p = input.providerSegmentStartAt.getTime();
  const m = input.prefixMovementAt.getTime();
  const c = input.candidateStartAt.getTime();

  if (m <= p) {
    return { kind: 'ADMIT_PROVIDER' };
  }
  if (m > p && m <= c) {
    return { kind: 'BOUND_EARLY', at: input.prefixMovementAt };
  }
  return { kind: 'UNCORROBORATED' };
}

export function resolveEvidenceBackedStartBoundary(
  input: ResolveEvidenceBackedStartBoundaryInput,
): EvidenceBackedStartBoundaryResult {
  const matchingSegment = selectConfirmedStartSegment(
    input.segments,
    input.candidateStartAt,
    input.confirmedAt,
  );

  const lookbackMs = deriveTripStartBoundaryMaxLookbackMs();
  const globalWindowFrom = new Date(
    input.candidateStartAt.getTime() - lookbackMs,
  );
  const globalMovement = findEarliestTrustedMovementInWindow(
    globalWindowFrom,
    input.confirmedAt,
    input.corePoints,
    input.routePoints,
    input.profile,
  );
  const earliestSupportedMovementAt = globalMovement.at;

  const uncertaintyBase = {
    departureReviewAnchorAt: input.departureReviewAnchorAt ?? null,
    uncorroboratedPrefixFromAt: null as Date | null,
    uncorroboratedPrefixToAt: null as Date | null,
    clockQuantizationNote: CLOCK_QUANTIZATION_NOTE,
  };

  if (!matchingSegment) {
    const decision =
      earliestSupportedMovementAt != null
        ? 'MOVEMENT_BOUNDARY_SELECTED'
        : 'CANDIDATE_BOUNDARY_FALLBACK';
    const canonicalStartAt =
      earliestSupportedMovementAt ?? input.candidateStartAt;
    return {
      providerSegmentStartAt: null,
      earliestSupportedMovementAt,
      candidateStartAt: input.candidateStartAt,
      canonicalStartAt,
      decision,
      matchingSegment: null,
      provenance: {
        integrationModality: input.integrationModality,
        providerSegmentId: null,
        providerSegmentDetectionMechanism: null,
        segmentDetectionMechanismIndependentlyProven:
          input.segmentDetectionMechanismIndependentlyProven ?? false,
        segmentAggregateActivitySources: [],
        movementEvidenceSources: globalMovement.sources,
        movementEvidenceCoverage:
          earliestSupportedMovementAt != null
            ? 'TRUSTED_MOVEMENT_PRESENT'
            : 'NO_DATA_IN_WINDOW',
        boundaryDecision: decision,
        boundaryAdjustmentMs:
          canonicalStartAt.getTime() - input.candidateStartAt.getTime(),
        legacyWouldHaveUsedProviderSegment: false,
      },
      uncertainty: uncertaintyBase,
    };
  }

  const providerSegmentStartAt = new Date(matchingSegment.startTime);
  const prefixCore = filterPointsInWindow(
    input.corePoints,
    providerSegmentStartAt.getTime(),
    input.candidateStartAt.getTime(),
  );
  const prefixRoute = filterPointsInWindow(
    input.routePoints,
    providerSegmentStartAt.getTime(),
    input.candidateStartAt.getTime(),
  );

  const prefixMovement = findEarliestTrustedMovementInWindow(
    providerSegmentStartAt,
    input.candidateStartAt,
    input.corePoints,
    input.routePoints,
    input.profile,
  );

  const segmentAggregates = segmentAggregateActivitySources(matchingSegment);
  const coverage = classifyCoverage(
    prefixMovement.at,
    segmentAggregates,
    prefixCore.length + prefixRoute.length,
  );

  const prefixAdmission = resolveProviderPrefixAdmission({
    providerSegmentStartAt,
    candidateStartAt: input.candidateStartAt,
    prefixMovementAt: prefixMovement.at,
  });

  let decision: EvidenceBackedStartBoundaryResult['decision'];
  let canonicalStartAt: Date;
  let movementSources: MovementEvidenceSource[] = prefixMovement.sources;

  if (prefixAdmission.kind === 'ADMIT_PROVIDER') {
    decision = 'PROVIDER_START_ADMITTED';
    canonicalStartAt = providerSegmentStartAt;
    movementSources = prefixMovement.sources;
  } else if (prefixAdmission.kind === 'BOUND_EARLY') {
    decision = 'PROVIDER_START_BOUNDED';
    canonicalStartAt = prefixAdmission.at;
    movementSources = prefixMovement.sources;
  } else if (earliestSupportedMovementAt != null) {
    decision = 'MOVEMENT_BOUNDARY_SELECTED';
    canonicalStartAt = earliestSupportedMovementAt;
    movementSources = globalMovement.sources;
  } else {
    decision = 'PROVIDER_START_UNCORROBORATED';
    canonicalStartAt = input.candidateStartAt;
    movementSources = ['NONE'];
  }

  const uncorroboratedPrefixToAt =
    prefixAdmission.kind === 'UNCORROBORATED' &&
    providerSegmentStartAt.getTime() < input.candidateStartAt.getTime()
      ? input.candidateStartAt
      : prefixMovement.at;

  return {
    providerSegmentStartAt,
    earliestSupportedMovementAt,
    candidateStartAt: input.candidateStartAt,
    canonicalStartAt,
    decision,
    matchingSegment,
    provenance: {
      integrationModality: input.integrationModality,
      providerSegmentId: matchingSegment.segmentId,
      providerSegmentDetectionMechanism: normalizeSegmentDetectionMechanism(
        matchingSegment.mechanism,
      ),
      segmentDetectionMechanismIndependentlyProven:
        input.segmentDetectionMechanismIndependentlyProven ?? false,
      segmentAggregateActivitySources: segmentAggregates,
      movementEvidenceSources:
        movementSources.length > 0 ? movementSources : ['NONE'],
      movementEvidenceCoverage: coverage,
      boundaryDecision: decision,
      boundaryAdjustmentMs:
        canonicalStartAt.getTime() - input.candidateStartAt.getTime(),
      legacyWouldHaveUsedProviderSegment: true,
    },
    uncertainty: {
      ...uncertaintyBase,
      uncorroboratedPrefixFromAt:
        decision === 'PROVIDER_START_UNCORROBORATED' ||
        decision === 'PROVIDER_START_BOUNDED'
          ? providerSegmentStartAt
          : null,
      uncorroboratedPrefixToAt,
    },
  };
}

// Re-export for tests
export { findEarliestTrustedMovementInWindow } from './trip-start-boundary-admission.movement';
