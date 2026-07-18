import type { StationOperationalEffectiveRule } from './station-operational-capability.contract';

export const STATION_BOOKING_RETURN_RULES_VERSION = 1 as const;

export const StationBookingReturnHardBlockReasonCode = {
  STATION_ORG_MISMATCH: 'STATION_ORG_MISMATCH',
  STATION_ARCHIVED: 'STATION_ARCHIVED',
  STATION_INACTIVE: 'STATION_INACTIVE',
  RETURN_DISABLED: 'RETURN_DISABLED',
  CONFIGURATION_INCOMPLETE: 'CONFIGURATION_INCOMPLETE',
  ONE_WAY_MISMATCH: 'ONE_WAY_MISMATCH',
} as const;

export type StationBookingReturnHardBlockReasonCode =
  (typeof StationBookingReturnHardBlockReasonCode)[keyof typeof StationBookingReturnHardBlockReasonCode];

export interface StationBookingReturnRulesMetadata {
  version: typeof STATION_BOOKING_RETURN_RULES_VERSION;
  contract: 'station-booking-return-rules';
  hardBlockReasons: StationBookingReturnHardBlockReasonCode[];
  adminOverrideBypasses: Array<'WARNING' | 'MANUAL_CONFIRMATION_REQUIRED'>;
}

export function getStationBookingReturnRulesMetadata(): StationBookingReturnRulesMetadata {
  return {
    version: STATION_BOOKING_RETURN_RULES_VERSION,
    contract: 'station-booking-return-rules',
    hardBlockReasons: Object.values(StationBookingReturnHardBlockReasonCode),
    adminOverrideBypasses: ['WARNING', 'MANUAL_CONFIRMATION_REQUIRED'],
  };
}

export function toReturnEffectiveRule(
  rule: StationOperationalEffectiveRule | null | undefined,
): StationOperationalEffectiveRule | null {
  if (!rule) return null;
  return {
    ruleId: rule.ruleId,
    source: rule.source,
    description: rule.description,
  };
}

export function deriveIsOneWayFromStationIds(
  pickupStationId: string | null | undefined,
  returnStationId: string | null | undefined,
): boolean {
  if (!pickupStationId || !returnStationId) {
    return false;
  }
  return pickupStationId !== returnStationId;
}
