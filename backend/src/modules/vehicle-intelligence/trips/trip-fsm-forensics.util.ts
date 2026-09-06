import { readRawDetectionMeta } from './boundary-repair.state.util';
import {
  classifyBoundaryAdjustment,
  computeSignedLatencySeconds,
  isValidTimingTimestamp,
} from './trip-fsm-timing.util';

export function parseStrictEvidenceTimestamp(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
}

export function safeForensicIsoString(value: Date | null | undefined): string | null {
  if (!value || !Number.isFinite(value.getTime())) return null;
  return value.toISOString();
}

export interface ResolvedStartForensicProvenance {
  startCandidateAt: Date | null;
  startCandidateEnteredAt: Date | null;
  startRecognizedAt: Date | null;
  startCandidateClockSource: string | null;
  startBoundarySource: string | null;
  startEvidencePath: string | null;
  startBoundaryAdjustedMs: number | null;
  flatStartCandidateAt: string | null;
}

export function resolveStartForensicProvenance(params: {
  evidenceSummary: Record<string, unknown> | null;
  detPossibleStartAt?: Date | null;
  detPossibleStartEnteredAt?: Date | null;
  canonicalStartAt: Date;
}): ResolvedStartForensicProvenance {
  const evidence = params.evidenceSummary ?? {};
  const hasPreservedCandidateField =
    evidence.startCandidateAt != null || evidence.startCandidateObservedAt != null;

  const startCandidateAt =
    parseStrictEvidenceTimestamp(evidence.startCandidateAt) ??
    parseStrictEvidenceTimestamp(evidence.startCandidateObservedAt) ??
    (hasPreservedCandidateField
      ? null
      : params.detPossibleStartEnteredAt != null
        ? parseStrictEvidenceTimestamp(params.detPossibleStartAt)
        : params.detPossibleStartAt &&
            params.detPossibleStartAt.getTime() !== params.canonicalStartAt.getTime()
          ? parseStrictEvidenceTimestamp(params.detPossibleStartAt)
          : null);

  const startCandidateEnteredAt =
    parseStrictEvidenceTimestamp(evidence.startCandidateEnteredAt) ??
    (params.detPossibleStartEnteredAt != null
      ? parseStrictEvidenceTimestamp(params.detPossibleStartEnteredAt)
      : null);

  const startRecognizedAt = parseStrictEvidenceTimestamp(evidence.startRecognizedAt);

  const startBoundaryAdjustedMs =
    typeof evidence.startBoundaryAdjustedMs === 'number'
      ? evidence.startBoundaryAdjustedMs
      : startCandidateAt && isValidTimingTimestamp(params.canonicalStartAt)
        ? params.canonicalStartAt.getTime() - startCandidateAt.getTime()
        : null;

  return {
    startCandidateAt,
    startCandidateEnteredAt,
    startRecognizedAt,
    startCandidateClockSource:
      typeof evidence.startCandidateClockSource === 'string'
        ? evidence.startCandidateClockSource
        : null,
    startBoundarySource:
      typeof evidence.confirmedStartSource === 'string'
        ? evidence.confirmedStartSource
        : null,
    startEvidencePath:
      typeof evidence.startEvidencePath === 'string' ? evidence.startEvidencePath : null,
    startBoundaryAdjustedMs,
    flatStartCandidateAt: safeForensicIsoString(startCandidateAt),
  };
}

export const TRIP_FSM_FORENSICS_VERSION = 'R8_V1';

export type EndCoordinateSource =
  | 'WAYPOINT_AT_OR_BEFORE_BOUNDARY'
  | 'NONE';

export interface TripFsmForensicsR8V1 {
  version: typeof TRIP_FSM_FORENSICS_VERSION;
  start: {
    candidateAt: string | null;
    candidateClock: 'EVENT_TIME';
    candidateClockSource: string | null;
    candidateEnteredAt: string | null;
    candidateEnteredClock: 'WORKER_TIME';
    recognizedAt: string | null;
    recognizedClock: 'WORKER_TIME';
    canonicalBoundaryAt: string | null;
    canonicalBoundaryClock: 'EVENT_TIME';
    boundarySource: string | null;
    evidencePath: string | null;
    boundaryAdjustmentMs: number | null;
  };
  end: {
    candidateAt: string | null;
    candidateClock: 'EVENT_TIME';
    candidateClockSource: string | null;
    candidateEnteredAt: string | null;
    candidateEnteredClock: 'WORKER_TIME';
    recognizedAt: string | null;
    recognizedClock: 'WORKER_TIME';
    canonicalBoundaryAt: string | null;
    canonicalBoundaryClock: 'EVENT_TIME';
    boundarySource: string | null;
    boundaryAdjustmentMs: number | null;
    detectionMode: string | null;
    confidence: string | null;
  };
}

export interface BuildTripFsmForensicsInput {
  startCandidateAt?: Date | null;
  startCandidateClockSource?: string | null;
  startCandidateEnteredAt?: Date | null;
  startRecognizedAt?: Date | null;
  canonicalStartAt?: Date | null;
  startBoundarySource?: string | null;
  startEvidencePath?: string | null;
  endCandidateAt?: Date | null;
  endCandidateClockSource?: string | null;
  endCandidateEnteredAt?: Date | null;
  endRecognizedAt?: Date | null;
  canonicalEndAt?: Date | null;
  endBoundarySource?: string | null;
  endDetectionMode?: string | null;
  endConfidence?: string | null;
}

export function buildTripFsmForensicsR8V1(
  input: BuildTripFsmForensicsInput,
): TripFsmForensicsR8V1 {
  const startAdjustment = classifyBoundaryAdjustment(
    input.startCandidateAt,
    input.canonicalStartAt,
  );
  const endAdjustment = classifyBoundaryAdjustment(
    input.endCandidateAt,
    input.canonicalEndAt,
  );

  return {
    version: TRIP_FSM_FORENSICS_VERSION,
    start: {
      candidateAt: safeForensicIsoString(input.startCandidateAt),
      candidateClock: 'EVENT_TIME',
      candidateClockSource: input.startCandidateClockSource ?? null,
      candidateEnteredAt: safeForensicIsoString(input.startCandidateEnteredAt),
      candidateEnteredClock: 'WORKER_TIME',
      recognizedAt: safeForensicIsoString(input.startRecognizedAt),
      recognizedClock: 'WORKER_TIME',
      canonicalBoundaryAt: safeForensicIsoString(input.canonicalStartAt),
      canonicalBoundaryClock: 'EVENT_TIME',
      boundarySource: input.startBoundarySource ?? null,
      evidencePath: input.startEvidencePath ?? null,
      boundaryAdjustmentMs: startAdjustment.signedAdjustmentMs,
    },
    end: {
      candidateAt: safeForensicIsoString(input.endCandidateAt),
      candidateClock: 'EVENT_TIME',
      candidateClockSource: input.endCandidateClockSource ?? null,
      candidateEnteredAt: safeForensicIsoString(input.endCandidateEnteredAt),
      candidateEnteredClock: 'WORKER_TIME',
      recognizedAt: safeForensicIsoString(input.endRecognizedAt),
      recognizedClock: 'WORKER_TIME',
      canonicalBoundaryAt: safeForensicIsoString(input.canonicalEndAt),
      canonicalBoundaryClock: 'EVENT_TIME',
      boundarySource: input.endBoundarySource ?? null,
      boundaryAdjustmentMs: endAdjustment.signedAdjustmentMs,
      detectionMode: input.endDetectionMode ?? null,
      confidence: input.endConfidence ?? null,
    },
  };
}

export function mergeFinalizeRawDetectionMeta(params: {
  priorRaw: unknown;
  finalizeLayer: Record<string, unknown>;
}): Record<string, unknown> {
  const priorMeta = readRawDetectionMeta(params.priorRaw);
  return {
    ...priorMeta,
    ...params.finalizeLayer,
    tripFsmForensics: params.finalizeLayer.tripFsmForensics ?? priorMeta.tripFsmForensics,
  };
}

export interface BoundaryConsistentEndCoordinate {
  endLatitude: number | null;
  endLongitude: number | null;
  endCoordinateSource: EndCoordinateSource;
  endCoordinateObservedAt: string | null;
}

export function resolveBoundaryConsistentEndCoordinate(input: {
  canonicalEndAt: Date;
  waypointAtOrBefore:
    | {
        latitude: number;
        longitude: number;
        recordedAt: Date;
      }
    | null
    | undefined;
}): BoundaryConsistentEndCoordinate {
  const waypoint = input.waypointAtOrBefore;
  if (
    waypoint &&
    isValidTimingTimestamp(waypoint.recordedAt) &&
    waypoint.recordedAt.getTime() <= input.canonicalEndAt.getTime()
  ) {
    return {
      endLatitude: waypoint.latitude,
      endLongitude: waypoint.longitude,
      endCoordinateSource: 'WAYPOINT_AT_OR_BEFORE_BOUNDARY',
      endCoordinateObservedAt: waypoint.recordedAt.toISOString(),
    };
  }
  return {
    endLatitude: null,
    endLongitude: null,
    endCoordinateSource: 'NONE',
    endCoordinateObservedAt: null,
  };
}

export function readPersistedEndRecognizedAt(raw: unknown): Date | null {
  const meta = readRawDetectionMeta(raw);
  const flat = meta.endRecognizedAt;
  if (typeof flat === 'string') {
    return parseStrictEvidenceTimestamp(flat);
  }
  const block = meta.tripFsmForensics;
  if (block != null && typeof block === 'object' && !Array.isArray(block)) {
    const end = (block as Record<string, unknown>).end;
    if (end != null && typeof end === 'object' && !Array.isArray(end)) {
      const recognizedAt = (end as Record<string, unknown>).recognizedAt;
      return parseStrictEvidenceTimestamp(recognizedAt);
    }
  }
  return null;
}

export function buildStartTimelineFields(input: {
  startCandidateAt?: Date | null;
  startCandidateEnteredAt?: Date | null;
  canonicalStartAt?: Date | null;
  startRecognizedAt?: Date | null;
}): {
  candidateLatencySec: number | null;
  recognitionLatencySec: number | null;
  boundaryAdjustmentSec: number | null;
} {
  return {
    candidateLatencySec: computeSignedLatencySeconds(
      input.startCandidateEnteredAt,
      input.startCandidateAt,
    ),
    recognitionLatencySec: computeSignedLatencySeconds(
      input.startRecognizedAt,
      input.canonicalStartAt,
    ),
    boundaryAdjustmentSec: computeSignedLatencySeconds(
      input.canonicalStartAt,
      input.startCandidateAt,
    ),
  };
}

export function buildEndTimelineFields(input: {
  possibleEndAt?: Date | null;
  possibleEndEnteredAt?: Date | null;
  canonicalEndAt?: Date | null;
  endRecognizedAt?: Date | null;
}): {
  candidateLatencySec: number | null;
  recognitionLatencySec: number | null;
  boundaryAdjustmentSec: number | null;
} {
  return {
    candidateLatencySec: computeSignedLatencySeconds(
      input.possibleEndEnteredAt,
      input.possibleEndAt,
    ),
    recognitionLatencySec: computeSignedLatencySeconds(
      input.endRecognizedAt,
      input.canonicalEndAt,
    ),
    boundaryAdjustmentSec: computeSignedLatencySeconds(
      input.canonicalEndAt,
      input.possibleEndAt,
    ),
  };
}
