import {
  StationBookingRuleOutcome,
  StationBookingRulesBookingType,
  type StationBookingRulesResult,
} from './station-booking-rules.contract';
import type { StationRuleManualOverrideInput } from './station-rule-manual-override.contract';

export const STATION_BOOKING_RULES_BLOCKED_CODE = 'STATION_BOOKING_RULES_BLOCKED' as const;
export const STATION_BOOKING_RULES_MANUAL_OVERRIDE_REQUIRED_CODE =
  'STATION_BOOKING_RULES_MANUAL_OVERRIDE_REQUIRED' as const;

export interface StationBookingRulesRequestContext {
  manualOverride?: StationRuleManualOverrideInput | null;
}

export function resolveServerBookingRulesType(
  isOneWayRental: boolean,
): StationBookingRulesBookingType {
  return isOneWayRental
    ? StationBookingRulesBookingType.ONE_WAY
    : StationBookingRulesBookingType.STANDARD;
}

export function extractStationBookingRulesContext(
  data: Record<string, unknown>,
): StationBookingRulesRequestContext | null {
  const raw = data.stationBookingRules;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const container = raw as Record<string, unknown>;
  const manualOverrideRaw = container.manualOverride;
  if (!manualOverrideRaw || typeof manualOverrideRaw !== 'object' || Array.isArray(manualOverrideRaw)) {
    return null;
  }

  const reason = (manualOverrideRaw as Record<string, unknown>).reason;
  if (typeof reason !== 'string' || !reason.trim()) {
    return null;
  }

  const expiresAt = (manualOverrideRaw as Record<string, unknown>).expiresAt;
  return {
    manualOverride: {
      reason: reason.trim(),
      expiresAt: typeof expiresAt === 'string' ? expiresAt : null,
    },
  };
}

export function stripStationBookingRulesRequestFields(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const { stationBookingRules: _stationBookingRules, ...rest } = data;
  return rest;
}

export function bookingRequiresStationRulesEvaluation(input: {
  pickupStationId?: string | null;
  returnStationId?: string | null;
  pickupAddressOverride?: string | null;
  returnAddressOverride?: string | null;
}): boolean {
  if (input.pickupAddressOverride?.trim() || input.returnAddressOverride?.trim()) {
    return false;
  }
  return Boolean(input.pickupStationId && input.returnStationId);
}

export function assessBookingStationRulesPersistence(result: StationBookingRulesResult): {
  allowed: boolean;
  blocked: boolean;
  manualOverrideRequired: boolean;
  code?: typeof STATION_BOOKING_RULES_BLOCKED_CODE | typeof STATION_BOOKING_RULES_MANUAL_OVERRIDE_REQUIRED_CODE;
} {
  const blocked =
    result.pickup.outcome === StationBookingRuleOutcome.BLOCKED ||
    result.return.outcome === StationBookingRuleOutcome.BLOCKED;

  if (blocked) {
    return {
      allowed: false,
      blocked: true,
      manualOverrideRequired: false,
      code: STATION_BOOKING_RULES_BLOCKED_CODE,
    };
  }

  if (result.manualOverrideRequired) {
    return {
      allowed: false,
      blocked: false,
      manualOverrideRequired: true,
      code: STATION_BOOKING_RULES_MANUAL_OVERRIDE_REQUIRED_CODE,
    };
  }

  return {
    allowed: true,
    blocked: false,
    manualOverrideRequired: false,
  };
}

export function serializeStationBookingRulesSnapshot(
  result: StationBookingRulesResult,
): StationBookingRulesResult {
  return result;
}
