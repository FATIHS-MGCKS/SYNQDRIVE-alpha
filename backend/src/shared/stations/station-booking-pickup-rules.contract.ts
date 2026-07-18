import type { StationOperationalEffectiveRule } from './station-operational-capability.contract';

export const STATION_BOOKING_PICKUP_RULES_VERSION = 1 as const;

export const StationBookingPickupHardBlockReasonCode = {
  STATION_ORG_MISMATCH: 'STATION_ORG_MISMATCH',
  STATION_ARCHIVED: 'STATION_ARCHIVED',
  STATION_INACTIVE: 'STATION_INACTIVE',
  PICKUP_DISABLED: 'PICKUP_DISABLED',
  CONFIGURATION_INCOMPLETE: 'CONFIGURATION_INCOMPLETE',
} as const;

export type StationBookingPickupHardBlockReasonCode =
  (typeof StationBookingPickupHardBlockReasonCode)[keyof typeof StationBookingPickupHardBlockReasonCode];

export interface StationBookingPickupRulesMetadata {
  version: typeof STATION_BOOKING_PICKUP_RULES_VERSION;
  contract: 'station-booking-pickup-rules';
  hardBlockReasons: StationBookingPickupHardBlockReasonCode[];
  adminOverrideBypasses: Array<'WARNING' | 'MANUAL_CONFIRMATION_REQUIRED'>;
}

export function getStationBookingPickupRulesMetadata(): StationBookingPickupRulesMetadata {
  return {
    version: STATION_BOOKING_PICKUP_RULES_VERSION,
    contract: 'station-booking-pickup-rules',
    hardBlockReasons: Object.values(StationBookingPickupHardBlockReasonCode),
    adminOverrideBypasses: ['WARNING', 'MANUAL_CONFIRMATION_REQUIRED'],
  };
}

export function toPickupEffectiveRule(
  rule: StationOperationalEffectiveRule | null | undefined,
): StationOperationalEffectiveRule | null {
  if (!rule) return null;
  return {
    ruleId: rule.ruleId,
    source: rule.source,
    description: rule.description,
  };
}
