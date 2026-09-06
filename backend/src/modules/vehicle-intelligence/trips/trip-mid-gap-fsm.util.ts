import { DetectionConfidence } from '@prisma/client';
import {
  clearPossibleEndClockFields,
} from './trip-fsm-clock-contract';
import { START_DETECTION_MODES, type StartDetectionMode } from './trip-detection.types';

/** Shared ACTIVE_TRIP FSM extras after a successful mid-gap split repoint. */
export function buildMidGapSplitActiveFsmExtras(params: {
  secondTripId: string;
  secondStartAt: Date;
}): Record<string, unknown> {
  const anchor = params.secondStartAt;
  return {
    activeTripId: params.secondTripId,
    possibleStartAt: anchor,
    possibleStartEnteredAt: null,
    ...clearPossibleEndClockFields(),
    endValidationAttempts: 0,
    endDetectionMode: null,
    endConfidence: null,
    cusumValidatedAt: null,
    cusumSegmentStart: null,
    cusumSegmentEnd: null,
    startDetectionMode:
      START_DETECTION_MODES.MID_TRIP_GAP_SPLIT as StartDetectionMode,
    startConfidence: DetectionConfidence.MEDIUM,
    lastActivityAt: anchor,
    lastMeaningfulMovementAt: anchor,
    lastRouteProcessedAt: anchor,
    lastDrivingProcessedAt: anchor,
    lastCoreProcessedAt: anchor,
    startOdometerKm: null,
    startFuelLevel: null,
    startEvSoc: null,
  };
}
