/**
 * P0.3 — P0.2 operational availability states for Fleet presentation.
 */
export const OPERATIONAL_AVAILABILITY_STATE = {
  AVAILABLE: 'AVAILABLE',
  NEEDS_VERIFICATION: 'NEEDS_VERIFICATION',
  UNKNOWN: 'UNKNOWN',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;

export type OperationalAvailabilityState =
  (typeof OPERATIONAL_AVAILABILITY_STATE)[keyof typeof OPERATIONAL_AVAILABILITY_STATE];

export interface FleetOperationalAvailability {
  /** Omitted when API state is absent or an unrecognized future enum value. */
  state?: OperationalAvailabilityState;
  /** Omitted when absent on API slice — do not coerce to null. */
  primaryReason?: string | null;
  /** Omitted when absent on API slice — do not coerce to []. */
  reasonCodes?: string[];
  /** Omitted when absent on API slice — do not coerce to NONE. */
  recommendedAction?: string;
  /** Omitted when absent on API slice — do not coerce to NONE. */
  attention?: string;
  generatedAt: string;
}

export function isOperationalAvailabilityState(
  value: unknown,
): value is OperationalAvailabilityState {
  return (
    value === OPERATIONAL_AVAILABILITY_STATE.AVAILABLE ||
    value === OPERATIONAL_AVAILABILITY_STATE.NEEDS_VERIFICATION ||
    value === OPERATIONAL_AVAILABILITY_STATE.UNKNOWN ||
    value === OPERATIONAL_AVAILABILITY_STATE.UNAVAILABLE
  );
}

export function normalizeOperationalAvailabilityState(
  value: unknown,
): OperationalAvailabilityState {
  return isOperationalAvailabilityState(value)
    ? value
    : OPERATIONAL_AVAILABILITY_STATE.UNKNOWN;
}
