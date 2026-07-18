import type { StationOperationalCapabilitySnapshot } from './station-operational-capability.contract';
import type { StationOperationalEffectiveRule } from './station-operational-capability.contract';
import type {
  StationCapacityBookingProjection,
  StationCapacityVehicleSnapshot,
} from './station-capacity-policy';

export const STATION_BOOKING_RULES_VERSION = 3 as const;

export const StationBookingRuleOutcome = {
  ALLOWED: 'ALLOWED',
  WARNING: 'WARNING',
  MANUAL_CONFIRMATION_REQUIRED: 'MANUAL_CONFIRMATION_REQUIRED',
  BLOCKED: 'BLOCKED',
} as const;

export type StationBookingRuleOutcome =
  (typeof StationBookingRuleOutcome)[keyof typeof StationBookingRuleOutcome];

export const StationBookingRuleReasonCode = {
  STATION_INACTIVE: 'STATION_INACTIVE',
  STATION_ARCHIVED: 'STATION_ARCHIVED',
  PICKUP_DISABLED: 'PICKUP_DISABLED',
  RETURN_DISABLED: 'RETURN_DISABLED',
  OUTSIDE_OPENING_HOURS: 'OUTSIDE_OPENING_HOURS',
  HOLIDAY_CLOSURE: 'HOLIDAY_CLOSURE',
  AFTER_HOURS_ALLOWED: 'AFTER_HOURS_ALLOWED',
  KEYBOX_REQUIRED: 'KEYBOX_REQUIRED',
  CAPACITY_WARNING: 'CAPACITY_WARNING',
  CAPACITY_BLOCK: 'CAPACITY_BLOCK',
  CONFIGURATION_INCOMPLETE: 'CONFIGURATION_INCOMPLETE',
  STATION_ORG_MISMATCH: 'STATION_ORG_MISMATCH',
  ADMIN_OVERRIDE_APPLIED: 'ADMIN_OVERRIDE_APPLIED',
  ALLOWED_WITH_INFO: 'ALLOWED_WITH_INFO',
  ONE_WAY_MISMATCH: 'ONE_WAY_MISMATCH',
} as const;

export type StationBookingRuleReasonCode =
  (typeof StationBookingRuleReasonCode)[keyof typeof StationBookingRuleReasonCode];

export const StationBookingRulesBookingType = {
  STANDARD: 'STANDARD',
  ONE_WAY: 'ONE_WAY',
  LONG_TERM: 'LONG_TERM',
  SUBSCRIPTION: 'SUBSCRIPTION',
} as const;

export type StationBookingRulesBookingType =
  (typeof StationBookingRulesBookingType)[keyof typeof StationBookingRulesBookingType];

export const StationBookingRulesSide = {
  PICKUP: 'pickup',
  RETURN: 'return',
} as const;

export type StationBookingRulesSide =
  (typeof StationBookingRulesSide)[keyof typeof StationBookingRulesSide];

export interface StationBookingRuleReason {
  code: StationBookingRuleReasonCode | string;
  message: string;
}

export interface StationBookingRuleEvaluation {
  ruleId: string;
  outcome: StationBookingRuleOutcome;
  reason: StationBookingRuleReason;
  stationId?: string | null;
  field: StationBookingRulesSide;
}

export const StationBookingRulesBookingChannel = {
  CUSTOMER: 'CUSTOMER',
  INTERNAL_ADMIN: 'INTERNAL_ADMIN',
} as const;

export type StationBookingRulesBookingChannel =
  (typeof StationBookingRulesBookingChannel)[keyof typeof StationBookingRulesBookingChannel];

export interface StationBookingRulesAdminOverride {
  enabled: boolean;
  reason: string;
  performedByUserId?: string | null;
}

export interface StationBookingRulesBookingContext {
  channel?: StationBookingRulesBookingChannel;
  adminOverride?: StationBookingRulesAdminOverride | null;
}

export interface StationBookingRulesOrganizationPolicy {
  /** Default WARNING for pickup outside opening hours. */
  outsideOpeningHoursPickupOutcome?: StationBookingRuleOutcome;
  /** Default MANUAL_CONFIRMATION_REQUIRED when after-hours return is not self-service. */
  outsideOpeningHoursReturnOutcome?: StationBookingRuleOutcome;
  /** How to present after-hours return when enabled + keybox available. */
  afterHoursReturnAllowedPresentation?: 'ALLOWED_WITH_INFO' | 'WARNING';
  /** Outcome when after-hours return is enabled but keybox is missing. */
  keyboxMissingReturnOutcome?: StationBookingRuleOutcome;
  holidayClosureOutcome?: StationBookingRuleOutcome;
  inactiveStationOutcome?: StationBookingRuleOutcome;
  configurationIncompleteOutcome?: StationBookingRuleOutcome;
  capacityWarningEnabled?: boolean;
  capacityBlockAtFull?: boolean;
}

export const DEFAULT_STATION_BOOKING_RULES_ORGANIZATION_POLICY: Required<StationBookingRulesOrganizationPolicy> =
  {
    outsideOpeningHoursPickupOutcome: StationBookingRuleOutcome.WARNING,
    outsideOpeningHoursReturnOutcome: StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED,
    afterHoursReturnAllowedPresentation: 'ALLOWED_WITH_INFO',
    keyboxMissingReturnOutcome: StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED,
    holidayClosureOutcome: StationBookingRuleOutcome.WARNING,
    inactiveStationOutcome: StationBookingRuleOutcome.BLOCKED,
    configurationIncompleteOutcome: StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED,
    capacityWarningEnabled: true,
    capacityBlockAtFull: true,
  };

export interface StationBookingRulesStationInput extends StationOperationalCapabilitySnapshot {
  id: string;
  organizationId?: string | null;
  capacity?: number | null;
  capacityVehicles?: StationCapacityVehicleSnapshot[];
  capacityBookingProjection?: StationCapacityBookingProjection;
}

export interface StationBookingRulesVehicleInput {
  id: string;
  homeStationId?: string | null;
  currentStationId?: string | null;
  expectedStationId?: string | null;
  status?: StationCapacityVehicleSnapshot['status'];
}

export interface StationBookingRulesInput {
  organizationId: string;
  pickupStation: StationBookingRulesStationInput | null;
  returnStation: StationBookingRulesStationInput | null;
  pickupDateTime: Date | string;
  returnDateTime: Date | string;
  bookingType: StationBookingRulesBookingType;
  vehicle?: StationBookingRulesVehicleInput | null;
  organizationPolicy?: StationBookingRulesOrganizationPolicy;
  bookingContext?: StationBookingRulesBookingContext | null;
}

export interface StationBookingRulesSideResult {
  side: StationBookingRulesSide;
  stationId: string | null;
  outcome: StationBookingRuleOutcome;
  reasons: StationBookingRuleReason[];
  evaluations: StationBookingRuleEvaluation[];
  effectiveRule: StationOperationalEffectiveRule | null;
  timezone: string | null;
  adminOverrideApplied: boolean;
}

export interface StationBookingRulesResult {
  version: typeof STATION_BOOKING_RULES_VERSION;
  evaluatedAt: string;
  bookingType: StationBookingRulesBookingType;
  derivedIsOneWay: boolean;
  pickup: StationBookingRulesSideResult;
  return: StationBookingRulesSideResult;
}

export interface StationBookingRulesContractMetadata {
  version: typeof STATION_BOOKING_RULES_VERSION;
  outcomes: StationBookingRuleOutcome[];
  reasonCodes: StationBookingRuleReasonCode[];
  bookingTypes: StationBookingRulesBookingType[];
  bookingIntegration: false;
}

export function getStationBookingRulesContractMetadata(): StationBookingRulesContractMetadata {
  return {
    version: STATION_BOOKING_RULES_VERSION,
    outcomes: Object.values(StationBookingRuleOutcome),
    reasonCodes: Object.values(StationBookingRuleReasonCode),
    bookingTypes: Object.values(StationBookingRulesBookingType),
    bookingIntegration: false,
  };
}
