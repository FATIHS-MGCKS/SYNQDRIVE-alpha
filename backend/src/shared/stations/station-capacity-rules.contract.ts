import { StationBookingRuleOutcome } from './station-booking-rules.contract';

export const STATION_CAPACITY_RULES_VERSION = 1 as const;

export const StationCapacityRuleSeverity = {
  WARNING: 'WARNING',
  MANUAL_CONFIRMATION_REQUIRED: 'MANUAL_CONFIRMATION_REQUIRED',
  BLOCKED: 'BLOCKED',
} as const;

export type StationCapacityRuleSeverity =
  (typeof StationCapacityRuleSeverity)[keyof typeof StationCapacityRuleSeverity];

export const StationCapacityRuleReasonCode = {
  CAPACITY_UNKNOWN: 'CAPACITY_UNKNOWN',
  CAPACITY_WARNING: 'CAPACITY_WARNING',
  CAPACITY_FULL: 'CAPACITY_FULL',
  CAPACITY_OVER: 'CAPACITY_OVER',
  CAPACITY_PROJECTED_OVER: 'CAPACITY_PROJECTED_OVER',
} as const;

export type StationCapacityRuleReasonCode =
  (typeof StationCapacityRuleReasonCode)[keyof typeof StationCapacityRuleReasonCode];

export interface StationCapacityRulesPolicy {
  capacityWarningEnabled: boolean;
  capacityBlockAtFull: boolean;
  capacityFullOutcome: StationBookingRuleOutcome;
  capacityProjectedOverOutcome: StationBookingRuleOutcome;
}

export const DEFAULT_STATION_CAPACITY_RULES_POLICY: StationCapacityRulesPolicy = {
  capacityWarningEnabled: true,
  capacityBlockAtFull: false,
  capacityFullOutcome: StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED,
  capacityProjectedOverOutcome: StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED,
};

export interface StationCapacityRulesMetadata {
  version: typeof STATION_CAPACITY_RULES_VERSION;
  contract: 'station-capacity-rules';
  defaultPolicy: StationCapacityRulesPolicy;
  unknownCapacityBlocksBooking: false;
}

export function getStationCapacityRulesMetadata(): StationCapacityRulesMetadata {
  return {
    version: STATION_CAPACITY_RULES_VERSION,
    contract: 'station-capacity-rules',
    defaultPolicy: DEFAULT_STATION_CAPACITY_RULES_POLICY,
    unknownCapacityBlocksBooking: false,
  };
}

export function toStationCapacityRulesPolicy(input?: {
  capacityWarningEnabled?: boolean;
  capacityBlockAtFull?: boolean;
  capacityFullOutcome?: StationBookingRuleOutcome;
  capacityProjectedOverOutcome?: StationBookingRuleOutcome;
}): StationCapacityRulesPolicy {
  return {
    ...DEFAULT_STATION_CAPACITY_RULES_POLICY,
    ...input,
  };
}
