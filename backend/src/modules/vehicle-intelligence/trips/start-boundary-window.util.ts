import type { DimoTripSegment } from '../../dimo/dimo-segments.service';

/** Mirrors TripDetectionOrchestrationService constants for testable boundary math. */
export const START_BOUNDARY_LOOKBACK_MS = 5 * 60_000;
export const START_BOUNDARY_BACKFILL_MS = 60_000;
export const POSSIBLE_START_CONFIRM_MAX_WAIT_MS = 180_000;

export function computeStartBoundaryWindowFrom(
  candidateStartAt: Date,
  confirmedAt: Date,
  lookbackMs: number = START_BOUNDARY_LOOKBACK_MS,
): Date {
  return new Date(
    Math.max(
      candidateStartAt.getTime() - lookbackMs,
      confirmedAt.getTime() - lookbackMs,
    ),
  );
}

export function computePossibleStartCoreFetchFrom(
  startAt: Date,
  now: Date,
  lookbackMs: number = START_BOUNDARY_LOOKBACK_MS,
  backfillMs: number = START_BOUNDARY_BACKFILL_MS,
): Date {
  return new Date(
    Math.max(startAt.getTime() - backfillMs, now.getTime() - lookbackMs),
  );
}

/**
 * Pure extraction of `TripDetectionOrchestrationService.selectConfirmedStartSegment`.
 * Segments with `startedBeforeRange=true` are rejected.
 */
export function selectConfirmedStartSegment(
  segments: DimoTripSegment[],
  candidateStartAt: Date,
  confirmedAt: Date,
): DimoTripSegment | null {
  const candidateMs = candidateStartAt.getTime();
  const confirmedMs = confirmedAt.getTime();

  return (
    segments.find((segment) => {
      if (segment.startedBeforeRange) return false;

      const startMs = new Date(segment.startTime).getTime();
      const endMs = segment.endTime
        ? new Date(segment.endTime).getTime()
        : confirmedMs;

      return startMs <= confirmedMs && endMs >= candidateMs;
    }) ?? null
  );
}

export interface DelayedStartScenarioResult {
  realDimoStart: Date;
  firstSynqDriveDetection: Date;
  possibleStartAt: Date;
  confirmationTime: Date;
  boundaryWindowFrom: Date;
  coreFetchFrom: Date;
  selectedDimoSegmentStart: Date | null;
  selectedDimoSegmentRejectedStartedBeforeRange: boolean;
  effectiveLiveStartEstimate: Date;
  missingPrefixMs: number;
}

/**
 * Models the live FSM path when movement is first seen at `firstDetectionAt`.
 * `possibleStartAt` is set to detection time (`now`), not the physical start.
 */
export function modelDelayedStartLiveBoundary(args: {
  realDimoStart: Date;
  firstDetectionAt: Date;
  confirmationDelayMs: number;
  dimoSegment: DimoTripSegment | null;
}): DelayedStartScenarioResult {
  const possibleStartAt = args.firstDetectionAt;
  const confirmationTime = new Date(
    args.firstDetectionAt.getTime() + args.confirmationDelayMs,
  );
  const boundaryWindowFrom = computeStartBoundaryWindowFrom(
    possibleStartAt,
    confirmationTime,
  );
  const coreFetchFrom = computePossibleStartCoreFetchFrom(
    possibleStartAt,
    confirmationTime,
  );

  const segmentInWindow =
    args.dimoSegment &&
    new Date(args.dimoSegment.startTime).getTime() < boundaryWindowFrom.getTime();

  const selected = args.dimoSegment
    ? selectConfirmedStartSegment(
        [args.dimoSegment],
        possibleStartAt,
        confirmationTime,
      )
    : null;

  const effectiveLiveStartEstimate = selected
    ? new Date(selected.startTime)
    : possibleStartAt;

  const missingPrefixMs = Math.max(
    0,
    effectiveLiveStartEstimate.getTime() - args.realDimoStart.getTime(),
  );

  return {
    realDimoStart: args.realDimoStart,
    firstSynqDriveDetection: args.firstDetectionAt,
    possibleStartAt,
    confirmationTime,
    boundaryWindowFrom,
    coreFetchFrom,
    selectedDimoSegmentStart: selected ? new Date(selected.startTime) : null,
    selectedDimoSegmentRejectedStartedBeforeRange: Boolean(
      args.dimoSegment && segmentInWindow && !selected,
    ),
    effectiveLiveStartEstimate,
    missingPrefixMs,
  };
}
