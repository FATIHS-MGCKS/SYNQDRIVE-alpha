/**
 * Pure DIMO segment vs trip boundary comparator (P33).
 * Read-only — never mutates trip boundaries.
 */
import type { DimoTripSegment } from '@modules/dimo/dimo-segments.service';
import {
  DIMO_SEGMENT_VALIDATION_TOLERANCES,
  MECHANISM_PROVIDER_SOURCE,
} from './dimo-trip-segment-validation.config';
import type {
  BoundaryDeltaMetrics,
  DimoSegmentDataQuality,
  DimoTripSegmentValidationMechanism,
  DimoTripSegmentValidationResult,
  DimoTripSegmentValidationStatus,
  MechanismSegmentValidationResult,
  SegmentBoundarySnapshot,
  TripBoundarySnapshot,
} from './dimo-trip-segment-validation.types';

const STATUS_SEVERITY: Record<DimoTripSegmentValidationStatus, number> = {
  MATCHED: 0,
  MINOR_BOUNDARY_DIFFERENCE: 1,
  SEGMENT_MISSING: 2,
  PROVIDER_ERROR: 3,
  MAJOR_BOUNDARY_DIFFERENCE: 4,
};

function absDeltaSeconds(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 1000;
}

function assessSegmentDataQuality(segment: DimoTripSegment): DimoSegmentDataQuality {
  if (segment.isOngoing) return 'LOW';
  if (segment.startedBeforeRange) return 'LOW';
  const hasDistance =
    segment.distanceKm != null ||
    (segment.odometerStartKm != null && segment.odometerEndKm != null);
  const hasEnd = segment.endTime != null;
  const hasCoords =
    segment.startLatitude != null &&
    segment.startLongitude != null &&
    segment.endLatitude != null &&
    segment.endLongitude != null;
  if (hasEnd && hasDistance && hasCoords && segment.durationSeconds > 0) return 'HIGH';
  if (hasEnd && segment.durationSeconds > 0) return 'MEDIUM';
  return 'LOW';
}

export function toSegmentBoundarySnapshot(
  segment: DimoTripSegment,
  mechanism: DimoTripSegmentValidationMechanism,
): SegmentBoundarySnapshot {
  return {
    segmentId: segment.segmentId,
    mechanism,
    startTime: new Date(segment.startTime),
    endTime: segment.endTime ? new Date(segment.endTime) : null,
    durationSeconds: segment.durationSeconds,
    distanceKm: segment.distanceKm,
    odometerStartKm: segment.odometerStartKm,
    odometerEndKm: segment.odometerEndKm,
    isOngoing: segment.isOngoing,
    startedBeforeRange: segment.startedBeforeRange,
    dataQuality: assessSegmentDataQuality(segment),
  };
}

function tripDurationSeconds(trip: TripBoundarySnapshot): number | null {
  if (trip.endTime == null) return null;
  if (trip.durationMinutes != null) return trip.durationMinutes * 60;
  return absDeltaSeconds(trip.startTime, trip.endTime);
}

function segmentDurationSeconds(segment: SegmentBoundarySnapshot): number {
  if (segment.endTime) {
    return absDeltaSeconds(segment.startTime, segment.endTime);
  }
  return segment.durationSeconds;
}

export function computeBoundaryDeltas(
  trip: TripBoundarySnapshot,
  segment: SegmentBoundarySnapshot,
): BoundaryDeltaMetrics {
  const tripDuration = tripDurationSeconds(trip);
  const segDuration = segmentDurationSeconds(segment);
  const tripDistance = trip.distanceKm;
  const segDistance = segment.distanceKm;

  return {
    startDeltaSec: absDeltaSeconds(trip.startTime, segment.startTime),
    endDeltaSec:
      trip.endTime && segment.endTime
        ? absDeltaSeconds(trip.endTime, segment.endTime)
        : null,
    durationDeltaSec:
      tripDuration != null ? Math.abs(tripDuration - segDuration) : null,
    distanceDeltaKm:
      tripDistance != null && segDistance != null
        ? Math.abs(tripDistance - segDistance)
        : null,
  };
}

export function classifyBoundaryDifference(
  deltas: BoundaryDeltaMetrics,
): Exclude<DimoTripSegmentValidationStatus, 'SEGMENT_MISSING' | 'PROVIDER_ERROR'> {
  const t = DIMO_SEGMENT_VALIDATION_TOLERANCES;
  const reasons: string[] = [];

  let hasMinor = false;
  let hasMajor = false;

  if (deltas.startDeltaSec != null) {
    if (deltas.startDeltaSec > t.majorStartEndDeltaSec) {
      hasMajor = true;
      reasons.push('START_DELTA_MAJOR');
    } else if (deltas.startDeltaSec > t.minorStartEndDeltaSec) {
      hasMinor = true;
      reasons.push('START_DELTA_MINOR');
    }
  }

  if (deltas.endDeltaSec != null) {
    if (deltas.endDeltaSec > t.majorStartEndDeltaSec) {
      hasMajor = true;
      reasons.push('END_DELTA_MAJOR');
    } else if (deltas.endDeltaSec > t.minorStartEndDeltaSec) {
      hasMinor = true;
      reasons.push('END_DELTA_MINOR');
    }
  } else if (deltas.startDeltaSec != null) {
    hasMajor = true;
    reasons.push('END_TIME_MISSING');
  }

  if (deltas.durationDeltaSec != null) {
    if (deltas.durationDeltaSec > t.majorDurationDeltaSec) {
      hasMajor = true;
      reasons.push('DURATION_DELTA_MAJOR');
    } else if (deltas.durationDeltaSec > t.minorDurationDeltaSec) {
      hasMinor = true;
      reasons.push('DURATION_DELTA_MINOR');
    }
  }

  if (deltas.distanceDeltaKm != null) {
    if (deltas.distanceDeltaKm > t.majorDistanceDeltaKm) {
      hasMajor = true;
      reasons.push('DISTANCE_DELTA_MAJOR');
    } else if (deltas.distanceDeltaKm > t.minorDistanceDeltaKm) {
      hasMinor = true;
      reasons.push('DISTANCE_DELTA_MINOR');
    }
  }

  if (hasMajor) return 'MAJOR_BOUNDARY_DIFFERENCE';
  if (hasMinor) return 'MINOR_BOUNDARY_DIFFERENCE';
  return 'MATCHED';
}

function temporalOverlapScore(
  trip: TripBoundarySnapshot,
  segment: SegmentBoundarySnapshot,
): number {
  const tripEnd = trip.endTime ?? trip.startTime;
  const segEnd = segment.endTime ?? segment.startTime;
  const overlapStart = Math.max(trip.startTime.getTime(), segment.startTime.getTime());
  const overlapEnd = Math.min(tripEnd.getTime(), segEnd.getTime());
  const overlap = Math.max(0, overlapEnd - overlapStart);
  const tripSpan = Math.max(1, tripEnd.getTime() - trip.startTime.getTime());
  return overlap / tripSpan;
}

export function findBestMatchingSegment(
  trip: TripBoundarySnapshot,
  segments: readonly DimoTripSegment[],
  mechanism: DimoTripSegmentValidationMechanism,
): SegmentBoundarySnapshot | null {
  if (segments.length === 0) return null;

  if (trip.dimoSegmentId) {
    const exact = segments.find((s) => s.segmentId === trip.dimoSegmentId);
    if (exact) return toSegmentBoundarySnapshot(exact, mechanism);
  }

  let best: SegmentBoundarySnapshot | null = null;
  let bestScore = -1;

  for (const raw of segments) {
    const snapshot = toSegmentBoundarySnapshot(raw, mechanism);
    const score = temporalOverlapScore(trip, snapshot);
    if (score > bestScore) {
      bestScore = score;
      best = snapshot;
    }
  }

  return bestScore > 0 ? best : null;
}

export function compareMechanism(
  trip: TripBoundarySnapshot,
  segments: readonly DimoTripSegment[],
  mechanism: DimoTripSegmentValidationMechanism,
  providerError: string | null,
): MechanismSegmentValidationResult {
  const providerSource = MECHANISM_PROVIDER_SOURCE[mechanism];
  const requiredSignals = ['segments', 'start', 'end', 'duration', 'distance'];

  if (providerError) {
    return {
      mechanism,
      status: 'PROVIDER_ERROR',
      matchedSegment: null,
      deltas: null,
      providerSource,
      providerError,
      reasons: ['DIMO_PROVIDER_ERROR'],
      requiredSignals,
    };
  }

  const matched = findBestMatchingSegment(trip, segments, mechanism);
  if (!matched) {
    return {
      mechanism,
      status: 'SEGMENT_MISSING',
      matchedSegment: null,
      deltas: null,
      providerSource,
      providerError: null,
      reasons: ['NO_OVERLAPPING_SEGMENT'],
      requiredSignals,
    };
  }

  const deltas = computeBoundaryDeltas(trip, matched);
  const status = classifyBoundaryDifference(deltas);
  const reasons: string[] = [];
  if (matched.dataQuality === 'LOW') reasons.push('LOW_SEGMENT_DATA_QUALITY');
  if (matched.isOngoing) reasons.push('SEGMENT_ONGOING');
  if (matched.startedBeforeRange) reasons.push('SEGMENT_STARTED_BEFORE_RANGE');
  if (trip.dimoSegmentId && trip.dimoSegmentId !== matched.segmentId) {
    reasons.push('SEGMENT_ID_MISMATCH');
  }
  if (status !== 'MATCHED') {
    const classification = classifyBoundaryDifference(deltas);
    if (classification === 'MINOR_BOUNDARY_DIFFERENCE') reasons.push('BOUNDARY_MINOR');
    if (classification === 'MAJOR_BOUNDARY_DIFFERENCE') reasons.push('BOUNDARY_MAJOR');
  }

  return {
    mechanism,
    status,
    matchedSegment: matched,
    deltas,
    providerSource,
    providerError: null,
    reasons,
    requiredSignals,
  };
}

function pickOverallResult(
  mechanisms: MechanismSegmentValidationResult[],
): {
  overallStatus: DimoTripSegmentValidationStatus;
  primaryMechanism: DimoTripSegmentValidationMechanism | null;
} {
  const ranked = mechanisms
    .filter((m) => m.status !== 'PROVIDER_ERROR')
    .sort((a, b) => {
      const severityDiff = STATUS_SEVERITY[a.status] - STATUS_SEVERITY[b.status];
      if (severityDiff !== 0) return severityDiff;
      const aEnd = a.deltas?.endDeltaSec ?? Number.POSITIVE_INFINITY;
      const bEnd = b.deltas?.endDeltaSec ?? Number.POSITIVE_INFINITY;
      return aEnd - bEnd;
    });

  if (ranked.length > 0) {
    return {
      overallStatus: ranked[0]!.status,
      primaryMechanism: ranked[0]!.mechanism,
    };
  }

  const providerOnly = mechanisms.find((m) => m.status === 'PROVIDER_ERROR');
  if (providerOnly) {
    return { overallStatus: 'PROVIDER_ERROR', primaryMechanism: providerOnly.mechanism };
  }

  return { overallStatus: 'SEGMENT_MISSING', primaryMechanism: null };
}

export function resolveDimoTripSegmentValidation(input: {
  modelVersion: string;
  trip: TripBoundarySnapshot;
  mechanisms: MechanismSegmentValidationResult[];
  skipped?: boolean;
  skipReason?: string | null;
}): DimoTripSegmentValidationResult {
  if (input.skipped) {
    return {
      modelVersion: input.modelVersion,
      skipped: true,
      skipReason: input.skipReason ?? 'FEATURE_DISABLED',
      overallStatus: null,
      primaryMechanism: null,
      trip: input.trip,
      mechanisms: input.mechanisms,
      reasons: [input.skipReason ?? 'FEATURE_DISABLED'],
    };
  }

  const { overallStatus, primaryMechanism } = pickOverallResult(input.mechanisms);
  const reasons = [
    ...new Set(input.mechanisms.flatMap((m) => m.reasons)),
    `OVERALL_${overallStatus}`,
  ];

  return {
    modelVersion: input.modelVersion,
    skipped: false,
    skipReason: null,
    overallStatus,
    primaryMechanism,
    trip: input.trip,
    mechanisms: input.mechanisms,
    reasons,
  };
}

/** Guard helper for tests — validation must never propose trip mutation. */
export function assertTripBoundaryImmutable(
  before: TripBoundarySnapshot,
  after: TripBoundarySnapshot,
): void {
  if (before.startTime.getTime() !== after.startTime.getTime()) {
    throw new Error('Trip startTime was mutated');
  }
  if ((before.endTime?.getTime() ?? null) !== (after.endTime?.getTime() ?? null)) {
    throw new Error('Trip endTime was mutated');
  }
  if (before.dimoSegmentId !== after.dimoSegmentId) {
    throw new Error('Trip dimoSegmentId was mutated');
  }
  if (before.distanceKm !== after.distanceKm) {
    throw new Error('Trip distanceKm was mutated');
  }
  if (before.durationMinutes !== after.durationMinutes) {
    throw new Error('Trip durationMinutes was mutated');
  }
}
