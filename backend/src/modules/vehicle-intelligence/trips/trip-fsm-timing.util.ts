/**
 * Trip FSM timing observability helpers (R8).
 *
 * Recognition vs candidate vs boundary adjustment are intentionally separate.
 * Invalid samples are rejected observably — never silently clamped to zero.
 */

export type TripTimingMetricName =
  | 'start_candidate_latency'
  | 'start_recognition_latency'
  | 'start_boundary_adjustment'
  | 'end_candidate_latency'
  | 'end_recognition_latency'
  | 'end_boundary_adjustment'
  | 'trip_duration';

export type TripTimingSampleRejectReason =
  | 'missing_anchor'
  | 'negative_delta'
  | 'invalid_timestamp';

export type BoundaryAdjustmentDirection = 'earlier' | 'later' | 'unchanged';

export const TRIP_FSM_TIMING_LATENCY_BUCKETS = [
  0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 900, 1800, 3600,
];

export const TRIP_FSM_BOUNDARY_ADJUSTMENT_BUCKETS = [
  0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 900, 1800,
];

export const TRIP_FSM_DURATION_BUCKETS = [
  60, 300, 900, 1800, 3600, 7200, 18000, 43200,
];

export type TimingTimestampClass = 'MISSING' | 'INVALID' | 'VALID';

export function classifyTimingTimestamp(
  value: Date | null | undefined,
): TimingTimestampClass {
  if (value == null) return 'MISSING';
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    return 'INVALID';
  }
  return 'VALID';
}

export function isValidTimingTimestamp(
  value: Date | null | undefined,
): value is Date {
  return classifyTimingTimestamp(value) === 'VALID';
}

function rejectReasonForTimingInputs(
  laterClass: TimingTimestampClass,
  earlierClass: TimingTimestampClass,
): TripTimingSampleRejectReason {
  if (laterClass === 'MISSING' || earlierClass === 'MISSING') {
    return 'missing_anchor';
  }
  if (laterClass === 'INVALID' || earlierClass === 'INVALID') {
    return 'invalid_timestamp';
  }
  return 'invalid_timestamp';
}

export function computeSignedLatencySeconds(
  later: Date | null | undefined,
  earlier: Date | null | undefined,
): number | null {
  if (!isValidTimingTimestamp(later) || !isValidTimingTimestamp(earlier)) {
    return null;
  }
  return (later.getTime() - earlier.getTime()) / 1000;
}

export function classifyBoundaryAdjustment(
  initialBoundary: Date | null | undefined,
  finalBoundary: Date | null | undefined,
): {
  adjustmentSec: number | null;
  direction: BoundaryAdjustmentDirection;
  signedAdjustmentMs: number | null;
} {
  if (
    !isValidTimingTimestamp(initialBoundary) ||
    !isValidTimingTimestamp(finalBoundary)
  ) {
    return {
      adjustmentSec: null,
      direction: 'unchanged',
      signedAdjustmentMs: null,
    };
  }
  const signedAdjustmentMs =
    finalBoundary.getTime() - initialBoundary.getTime();
  if (signedAdjustmentMs === 0) {
    return {
      adjustmentSec: 0,
      direction: 'unchanged',
      signedAdjustmentMs: 0,
    };
  }
  return {
    adjustmentSec: Math.abs(signedAdjustmentMs) / 1000,
    direction: signedAdjustmentMs < 0 ? 'earlier' : 'later',
    signedAdjustmentMs,
  };
}

export interface TripTimingObservationResult {
  observed: boolean;
  latencySec: number | null;
  rejectReason?: TripTimingSampleRejectReason;
}

export function evaluateCandidateLatencyObservation(params: {
  enteredAt: Date | null | undefined;
  candidateAt: Date | null | undefined;
}): TripTimingObservationResult {
  const enteredClass = classifyTimingTimestamp(params.enteredAt);
  const candidateClass = classifyTimingTimestamp(params.candidateAt);
  if (enteredClass !== 'VALID' || candidateClass !== 'VALID') {
    return {
      observed: false,
      latencySec: null,
      rejectReason: rejectReasonForTimingInputs(enteredClass, candidateClass),
    };
  }
  const latencySec = computeSignedLatencySeconds(params.enteredAt, params.candidateAt);
  if (latencySec == null) {
    return { observed: false, latencySec: null, rejectReason: 'invalid_timestamp' };
  }
  if (latencySec < 0) {
    return { observed: false, latencySec, rejectReason: 'negative_delta' };
  }
  return { observed: true, latencySec };
}

export function evaluateRecognitionLatencyObservation(params: {
  recognizedAt: Date | null | undefined;
  canonicalBoundaryAt: Date | null | undefined;
}): TripTimingObservationResult {
  return evaluateCandidateLatencyObservation({
    enteredAt: params.recognizedAt,
    candidateAt: params.canonicalBoundaryAt,
  });
}

export function evaluateBoundaryAdjustmentObservation(params: {
  initialBoundaryAt: Date | null | undefined;
  finalBoundaryAt: Date | null | undefined;
}): TripTimingObservationResult & {
  direction: BoundaryAdjustmentDirection;
  signedAdjustmentMs: number | null;
} {
  const initialClass = classifyTimingTimestamp(params.initialBoundaryAt);
  const finalClass = classifyTimingTimestamp(params.finalBoundaryAt);
  const classified = classifyBoundaryAdjustment(
    params.initialBoundaryAt,
    params.finalBoundaryAt,
  );
  if (initialClass !== 'VALID' || finalClass !== 'VALID') {
    return {
      observed: false,
      latencySec: null,
      rejectReason: rejectReasonForTimingInputs(finalClass, initialClass),
      direction: classified.direction,
      signedAdjustmentMs: classified.signedAdjustmentMs,
    };
  }
  if (classified.adjustmentSec == null) {
    return {
      observed: false,
      latencySec: null,
      rejectReason: 'invalid_timestamp',
      direction: classified.direction,
      signedAdjustmentMs: classified.signedAdjustmentMs,
    };
  }
  return {
    observed: true,
    latencySec: classified.adjustmentSec,
    direction: classified.direction,
    signedAdjustmentMs: classified.signedAdjustmentMs,
  };
}

export function evaluateDurationObservation(params: {
  startAt: Date | null | undefined;
  endAt: Date | null | undefined;
}): TripTimingObservationResult {
  const startClass = classifyTimingTimestamp(params.startAt);
  const endClass = classifyTimingTimestamp(params.endAt);
  if (startClass !== 'VALID' || endClass !== 'VALID') {
    return {
      observed: false,
      latencySec: null,
      rejectReason: rejectReasonForTimingInputs(endClass, startClass),
    };
  }
  const latencySec = computeSignedLatencySeconds(params.endAt, params.startAt);
  if (latencySec == null) {
    return { observed: false, latencySec: null, rejectReason: 'invalid_timestamp' };
  }
  if (latencySec < 0) {
    return { observed: false, latencySec, rejectReason: 'negative_delta' };
  }
  return { observed: true, latencySec };
}
