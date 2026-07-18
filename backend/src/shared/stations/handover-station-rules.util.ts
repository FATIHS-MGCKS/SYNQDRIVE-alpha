import { StationBookingRuleOutcome } from './station-booking-rules.contract';
import {
  HANDOVER_STATION_RULES_BLOCKED_CODE,
  HANDOVER_STATION_RULES_MANUAL_OVERRIDE_REQUIRED_CODE,
  type HandoverStationRulesResult,
} from './handover-station-rules.contract';

export function assessHandoverStationRulesPersistence(result: HandoverStationRulesResult): {
  allowed: boolean;
  blocked: boolean;
  manualOverrideRequired: boolean;
  code?:
    | typeof HANDOVER_STATION_RULES_BLOCKED_CODE
    | typeof HANDOVER_STATION_RULES_MANUAL_OVERRIDE_REQUIRED_CODE;
} {
  if (result.outcome === StationBookingRuleOutcome.BLOCKED) {
    return {
      allowed: false,
      blocked: true,
      manualOverrideRequired: false,
      code: HANDOVER_STATION_RULES_BLOCKED_CODE,
    };
  }

  if (result.manualOverrideRequired) {
    return {
      allowed: false,
      blocked: false,
      manualOverrideRequired: true,
      code: HANDOVER_STATION_RULES_MANUAL_OVERRIDE_REQUIRED_CODE,
    };
  }

  return {
    allowed: true,
    blocked: false,
    manualOverrideRequired: false,
  };
}

export function serializeHandoverStationRulesSnapshot(
  result: HandoverStationRulesResult,
): HandoverStationRulesResult {
  return result;
}
