import { OrganizationStatus, TripDetectionState } from '@prisma/client';

/** Trip-detection states where routine DIMO/HM polling may continue under SUSPENDED (trip completion). */
export const IN_FLIGHT_TRIP_DETECTION_STATES: TripDetectionState[] = [
  TripDetectionState.POSSIBLE_START,
  TripDetectionState.ACTIVE_TRIP,
  TripDetectionState.IDLE_WITHIN_TRIP,
  TripDetectionState.POSSIBLE_END,
];

/**
 * P6D4 — SUSPENDED stops *routine* provider polling; ARCHIVED stops all routine polling.
 * In-flight trip completion may still require provider reads while detection is active.
 */
export function organizationAllowsRoutineProviderPolling(input: {
  organizationStatus: OrganizationStatus;
  tripDetectionState?: TripDetectionState | null;
}): boolean {
  if (input.organizationStatus === OrganizationStatus.ACTIVE) {
    return true;
  }
  if (input.organizationStatus === OrganizationStatus.ARCHIVED) {
    return false;
  }
  if (input.organizationStatus === OrganizationStatus.PENDING) {
    return false;
  }
  if (input.organizationStatus === OrganizationStatus.SUSPENDED) {
    const state = input.tripDetectionState;
    return state != null && IN_FLIGHT_TRIP_DETECTION_STATES.includes(state);
  }
  return false;
}