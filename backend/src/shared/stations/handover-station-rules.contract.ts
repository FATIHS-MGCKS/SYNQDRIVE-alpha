import type { StationBookingRuleEvaluation, StationBookingRuleOutcome, StationBookingRuleReason, StationBookingRulesEvaluatedInstant } from './station-booking-rules.contract';
import type { StationRuleManualOverrideAuditRecord } from './station-rule-manual-override.contract';

export const HANDOVER_STATION_RULES_VERSION = 1 as const;

export const HandoverStationRulesKind = {
  PICKUP: 'PICKUP',
  RETURN: 'RETURN',
} as const;

export type HandoverStationRulesKind =
  (typeof HandoverStationRulesKind)[keyof typeof HandoverStationRulesKind];

export const HANDOVER_STATION_RULES_BLOCKED_CODE = 'HANDOVER_STATION_RULES_BLOCKED' as const;
export const HANDOVER_STATION_RULES_MANUAL_OVERRIDE_REQUIRED_CODE =
  'HANDOVER_STATION_RULES_MANUAL_OVERRIDE_REQUIRED' as const;

export interface HandoverStationRulesResult {
  version: typeof HANDOVER_STATION_RULES_VERSION;
  evaluatedAt: string;
  kind: HandoverStationRulesKind;
  actualStationId: string;
  plannedStationId: string | null;
  outcome: StationBookingRuleOutcome;
  reasons: StationBookingRuleReason[];
  evaluations: StationBookingRuleEvaluation[];
  evaluatedInstant: StationBookingRulesEvaluatedInstant;
  manualOverrideRequired: boolean;
  manualOverrideApplied: boolean;
  manualOverrideAudit: StationRuleManualOverrideAuditRecord | null;
  /** Booking-time evaluation may be stale — handover always re-evaluates at performedAt. */
  replacesBookingTimeEvaluation: true;
}
