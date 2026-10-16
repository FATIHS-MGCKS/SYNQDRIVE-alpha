import type {
  DimoTripSegment,
  RoutePoint,
  TripCoreDataPoint,
} from '../../../dimo/dimo-segments.service';
import { refineTripStartBoundary } from '../trip-evidence.helpers';
import { selectConfirmedStartSegment } from '../start-boundary-window.util';
import type {
  EvidenceBackedStartBoundaryResult,
  MovementEvidenceCoverageState,
  MovementEvidenceSource,
  ResolveEvidenceBackedStartBoundaryInput,
  TripStartProviderMechanism,
} from './trip-start-boundary-admission.types';

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

/**
 * Earliest trusted movement inside [windowFrom, windowTo] using the same
 * thresholds as `refineTripStartBoundary`. NO_DATA != STATIONARY.
 */
export function findEarliestTrustedMovementInWindow(
  windowFrom: Date,
  windowTo: Date,
  corePoints: TripCoreDataPoint[],
  routePoints: RoutePoint[],
  profile: string,
): { at: Date | null; sources: MovementEvidenceSource[] } {
  const fromMs = windowFrom.getTime();
  const toMs = windowTo.getTime();
  const core = filterPointsInWindow(corePoints, fromMs, toMs);
  const route = filterPointsInWindow(routePoints, fromMs, toMs);

  if (core.length === 0 && route.length === 0) {
    return { at: null, sources: ['NONE'] };
  }

  const refined = refineTripStartBoundary(windowTo, core, route, profile);
  if (refined.source === 'SNAPSHOT_CANDIDATE') {
    return { at: null, sources: ['NONE'] };
  }

  const sources: MovementEvidenceSource[] = [];
  if (refined.source === 'ROUTE_ACTIVITY') {
    sources.push('ROUTE_POSITION', 'ROUTE_SPEED');
  } else if (refined.source === 'CORE_ACTIVITY') {
    sources.push('CORE_SPEED', 'CORE_ODOMETER');
  }

  return { at: refined.startAt, sources };
}

function segmentHardwareMovementCorroboration(
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
  segmentHardwareSources: MovementEvidenceSource[],
  coreRouteCount: number,
  providerMechanism: TripStartProviderMechanism,
): MovementEvidenceCoverageState {
  if (prefixMovementAt != null || segmentHardwareSources.length > 0) {
    return 'TRUSTED_MOVEMENT_PRESENT';
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
  segmentHardwareSources: MovementEvidenceSource[];
  providerMechanism: TripStartProviderMechanism;
}):
  | { kind: 'ADMIT_PROVIDER' }
  | { kind: 'BOUND_EARLY'; at: Date }
  | { kind: 'UNCORROBORATED' } {
  if (
    input.providerMechanism === 'HARDWARE_DEVICE' &&
    input.segmentHardwareSources.length > 0
  ) {
    return { kind: 'ADMIT_PROVIDER' };
  }

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

  const globalMovement = refineTripStartBoundary(
    input.candidateStartAt,
    input.corePoints,
    input.routePoints,
    input.profile,
  );
  const earliestSupportedMovementAt =
    globalMovement.source === 'SNAPSHOT_CANDIDATE'
      ? null
      : globalMovement.startAt;

  if (!matchingSegment) {
    const decision =
      earliestSupportedMovementAt != null
        ? 'MOVEMENT_BOUNDARY_SELECTED'
        : 'CANDIDATE_BOUNDARY_FALLBACK';
    return {
      providerSegmentStartAt: null,
      earliestSupportedMovementAt,
      candidateStartAt: input.candidateStartAt,
      canonicalStartAt: globalMovement.startAt,
      decision,
      matchingSegment: null,
      provenance: {
        providerMechanism: input.providerMechanism,
        providerSegmentId: null,
        providerSegmentDetectionMechanism: null,
        movementEvidenceSources: earliestSupportedMovementAt
          ? ['CORE_SPEED', 'ROUTE_POSITION']
          : ['NONE'],
        movementEvidenceCoverage:
          earliestSupportedMovementAt != null
            ? 'TRUSTED_MOVEMENT_PRESENT'
            : 'NO_DATA_IN_WINDOW',
        boundaryDecision: decision,
        boundaryAdjustmentMs:
          globalMovement.startAt.getTime() - input.candidateStartAt.getTime(),
        legacyWouldHaveUsedProviderSegment: false,
      },
      uncertainty: {
        lastConfirmedStationaryUpperBoundAt:
          input.departureReviewWindowStartAt ?? null,
        uncorroboratedPrefixFromAt: null,
        uncorroboratedPrefixToAt: null,
        clockQuantizationNote: CLOCK_QUANTIZATION_NOTE,
      },
    };
  }

  const providerSegmentStartAt = new Date(matchingSegment.startTime);
  const prefixWindowEnd = input.confirmedAt;
  const prefixCore = filterPointsInWindow(
    input.corePoints,
    providerSegmentStartAt.getTime(),
    prefixWindowEnd.getTime(),
  );
  const prefixRoute = filterPointsInWindow(
    input.routePoints,
    providerSegmentStartAt.getTime(),
    prefixWindowEnd.getTime(),
  );

  const prefixMovement = findEarliestTrustedMovementInWindow(
    providerSegmentStartAt,
    input.candidateStartAt,
    input.corePoints,
    input.routePoints,
    input.profile,
  );

  const segmentHardwareSources = segmentHardwareMovementCorroboration(
    matchingSegment,
  );
  const coverage = classifyCoverage(
    prefixMovement.at,
    segmentHardwareSources,
    prefixCore.length + prefixRoute.length,
    input.providerMechanism,
  );

  const movementSources = [
    ...new Set([...prefixMovement.sources, ...segmentHardwareSources]),
  ].filter((s) => s !== 'NONE');

  const prefixAdmission = resolveProviderPrefixAdmission({
    providerSegmentStartAt,
    candidateStartAt: input.candidateStartAt,
    prefixMovementAt: prefixMovement.at,
    segmentHardwareSources,
    providerMechanism: input.providerMechanism,
  });

  let decision: EvidenceBackedStartBoundaryResult['decision'];
  let canonicalStartAt: Date;

  if (prefixAdmission.kind === 'ADMIT_PROVIDER') {
    decision = 'PROVIDER_START_ADMITTED';
    canonicalStartAt = providerSegmentStartAt;
  } else if (prefixAdmission.kind === 'BOUND_EARLY') {
    decision = 'PROVIDER_START_BOUNDED';
    canonicalStartAt = prefixAdmission.at;
  } else if (earliestSupportedMovementAt != null) {
    decision = 'MOVEMENT_BOUNDARY_SELECTED';
    canonicalStartAt = earliestSupportedMovementAt;
  } else {
    decision = 'PROVIDER_START_UNCORROBORATED';
    canonicalStartAt = input.candidateStartAt;
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
      providerMechanism: input.providerMechanism,
      providerSegmentId: matchingSegment.segmentId,
      providerSegmentDetectionMechanism: matchingSegment.mechanism,
      movementEvidenceSources:
        movementSources.length > 0 ? movementSources : ['NONE'],
      movementEvidenceCoverage: coverage,
      boundaryDecision: decision,
      boundaryAdjustmentMs:
        canonicalStartAt.getTime() - input.candidateStartAt.getTime(),
      legacyWouldHaveUsedProviderSegment: true,
    },
    uncertainty: {
      lastConfirmedStationaryUpperBoundAt:
        input.departureReviewWindowStartAt ?? null,
      uncorroboratedPrefixFromAt:
        decision === 'PROVIDER_START_UNCORROBORATED' ||
        decision === 'PROVIDER_START_BOUNDED'
          ? providerSegmentStartAt
          : null,
      uncorroboratedPrefixToAt,
      clockQuantizationNote: CLOCK_QUANTIZATION_NOTE,
    },
  };
}
