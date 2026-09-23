import type { BatteryRestSessionEndReason } from '@prisma/client';

/** Closed orchestration taxonomy — must not drive C3 semantics or digest input. */
export type RestSessionFeatureShadowTriggerReason =
  | 'VALID_REST_OBSERVATION_LINKED'
  | 'REST_SESSION_TERMINAL'
  | 'LATE_TRIP_ASSOCIATION';

/** Optional terminal metadata for logs only — not persisted into C3 input. */
export type RestSessionFeatureShadowTerminalSubcontext =
  | 'NEW_TRIP'
  | 'VEHICLE_ACTIVITY'
  | 'CHARGING_DETECTED'
  | 'SESSION_TIMEOUT'
  | 'INVALIDATED'
  | 'MANUAL';

export type RestSessionFeatureShadowTriggerInput = {
  organizationId: string;
  vehicleId: string;
  restSessionId: string;
  reason: RestSessionFeatureShadowTriggerReason;
  terminalSubcontext?: RestSessionFeatureShadowTerminalSubcontext;
};

export type RestSessionFeatureShadowTriggerOutcome =
  | { status: 'SKIPPED_FLAG_OFF' }
  | { status: 'CREATED' }
  | { status: 'DUPLICATE_EXISTING' }
  | { status: 'SESSION_NOT_FOUND' }
  | { status: 'FAILED_ISOLATED'; errorClass: string; errorMessage: string };

export function mapRestSessionEndReasonToTerminalSubcontext(
  endReason: BatteryRestSessionEndReason,
): RestSessionFeatureShadowTerminalSubcontext {
  switch (endReason) {
    case 'NEW_TRIP':
      return 'NEW_TRIP';
    case 'VEHICLE_ACTIVITY':
      return 'VEHICLE_ACTIVITY';
    case 'CHARGING_DETECTED':
      return 'CHARGING_DETECTED';
    case 'SESSION_TIMEOUT':
      return 'SESSION_TIMEOUT';
    case 'INVALIDATED':
      return 'INVALIDATED';
    default:
      return 'MANUAL';
  }
}
