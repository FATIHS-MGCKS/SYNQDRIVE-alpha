import { StationBookingRuleOutcome } from './station-booking-rules.contract';

export const STATION_RULE_MANUAL_OVERRIDE_VERSION = 1 as const;

export const StationRuleManualOverrideReferenceType = {
  BOOKING_RULES: 'BOOKING_RULES',
  TRANSFER_PLAN: 'TRANSFER_PLAN',
} as const;

export type StationRuleManualOverrideReferenceType =
  (typeof StationRuleManualOverrideReferenceType)[keyof typeof StationRuleManualOverrideReferenceType];

/** Permission required to apply a manual station rule override. */
export const STATION_RULE_MANUAL_OVERRIDE_PERMISSION = 'stations.override_rules' as const;

export const STATION_RULE_MANUAL_OVERRIDE_MIN_REASON_LENGTH = 10;
export const STATION_RULE_MANUAL_OVERRIDE_DEFAULT_TTL_MS = 15 * 60 * 1000;
export const STATION_RULE_MANUAL_OVERRIDE_MAX_TTL_MS = 24 * 60 * 60 * 1000;

export const StationRuleManualOverrideReasonCode = {
  OVERRIDE_APPLIED: 'STATION_RULE_MANUAL_OVERRIDE_APPLIED',
  OVERRIDE_REQUIRED: 'STATION_RULE_MANUAL_OVERRIDE_REQUIRED',
  OVERRIDE_BLOCKED_OUTCOME: 'STATION_RULE_MANUAL_OVERRIDE_BLOCKED_OUTCOME',
  OVERRIDE_INVALID_REASON: 'STATION_RULE_MANUAL_OVERRIDE_INVALID_REASON',
  OVERRIDE_INVALID_EXPIRY: 'STATION_RULE_MANUAL_OVERRIDE_INVALID_EXPIRY',
  OVERRIDE_SCOPE_MISMATCH: 'STATION_RULE_MANUAL_OVERRIDE_SCOPE_MISMATCH',
  OVERRIDE_PERMISSION_DENIED: 'STATION_RULE_MANUAL_OVERRIDE_PERMISSION_DENIED',
  OVERRIDE_NOT_REQUESTED: 'STATION_RULE_MANUAL_OVERRIDE_NOT_REQUESTED',
} as const;

export type StationRuleManualOverrideReasonCode =
  (typeof StationRuleManualOverrideReasonCode)[keyof typeof StationRuleManualOverrideReasonCode];

export interface StationRuleManualOverrideScope {
  organizationId: string;
  pickupStationId?: string | null;
  returnStationId?: string | null;
  pickupDateTime?: string | null;
  returnDateTime?: string | null;
  bookingType?: string | null;
  vehicleId?: string | null;
  transferVehicleId?: string | null;
  transferFromStationId?: string | null;
  transferToStationId?: string | null;
  plannedAt?: string | null;
  expectedArrivalAt?: string | null;
}

export interface StationRuleManualOverrideReference {
  type: StationRuleManualOverrideReferenceType;
  bookingId?: string | null;
  transferId?: string | null;
}

export interface StationRuleManualOverrideInput {
  reason: string;
  expiresAt?: string | Date | null;
}

export interface StationRuleManualOverrideActor {
  userId: string;
  permission: string;
}

export interface StationRuleManualOverrideRuleResultSnapshot {
  ruleId?: string;
  outcome: StationBookingRuleOutcome | string;
  code?: string;
  message: string;
  field?: string;
  stationId?: string | null;
}

export interface StationRuleManualOverrideAuditRecord {
  id: string;
  organizationId: string;
  referenceType: StationRuleManualOverrideReferenceType;
  reference: StationRuleManualOverrideReference;
  scopeFingerprint: string;
  scopeSnapshot: StationRuleManualOverrideScope;
  permission: string;
  reason: string;
  actorUserId: string;
  grantedAt: string;
  expiresAt: string;
  originalRuleResults: StationRuleManualOverrideRuleResultSnapshot[];
}

export interface StationRuleManualOverrideContractMetadata {
  version: typeof STATION_RULE_MANUAL_OVERRIDE_VERSION;
  permission: typeof STATION_RULE_MANUAL_OVERRIDE_PERMISSION;
  overridableOutcomes: Array<
    | typeof StationBookingRuleOutcome.WARNING
    | typeof StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED
  >;
  blockedOutcome: typeof StationBookingRuleOutcome.BLOCKED;
  defaultTtlMs: number;
  maxTtlMs: number;
  minReasonLength: number;
  autoReuse: false;
  serverValidated: true;
}

export function getStationRuleManualOverrideContractMetadata(): StationRuleManualOverrideContractMetadata {
  return {
    version: STATION_RULE_MANUAL_OVERRIDE_VERSION,
    permission: STATION_RULE_MANUAL_OVERRIDE_PERMISSION,
    overridableOutcomes: [
      StationBookingRuleOutcome.WARNING,
      StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED,
    ],
    blockedOutcome: StationBookingRuleOutcome.BLOCKED,
    defaultTtlMs: STATION_RULE_MANUAL_OVERRIDE_DEFAULT_TTL_MS,
    maxTtlMs: STATION_RULE_MANUAL_OVERRIDE_MAX_TTL_MS,
    minReasonLength: STATION_RULE_MANUAL_OVERRIDE_MIN_REASON_LENGTH,
    autoReuse: false,
    serverValidated: true,
  };
}
