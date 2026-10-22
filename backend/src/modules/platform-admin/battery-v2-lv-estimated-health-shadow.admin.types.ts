import type { LvEstimatedBatteryHealthAssessmentV1 } from '../vehicle-intelligence/battery-health/generalized-evidence/lv-estimated-battery-health/lv-estimated-battery-health-v1.types';
import type { LvOperationalGeDataSelectionV1 } from '../vehicle-intelligence/battery-health/generalized-evidence/lv-operational-condition/lv-operational-condition-v1.types';

/** Provider-event-time as-of semantics for shadow replay (not ingestion-time availability). */
export type LvEstimatedBatteryHealthShadowTemporalSemanticsV1 = {
  observationAsOfAuthority: 'PROVIDER_OBSERVATION_TIMESTAMP';
  ingestionTimeAsOfGuarantee: false;
  preStartFollowUpWindowMs: 120_000;
  note: string;
};

export type LvEstimatedBatteryHealthShadowAdminV1 = {
  shadowContractVersion: 'LV_ESTIMATED_BATTERY_HEALTH_SHADOW_ADMIN_V1';
  organizationId: string;
  vehicleId: string;
  evaluatedAtIso: string;
  temporalSemantics: LvEstimatedBatteryHealthShadowTemporalSemanticsV1;
  /**
   * Measured-intelligence `scientificBoundary.batteryHealthAssessment` remains NOT_ASSESSED by design.
   * Use `assessment` for N16 shadow output.
   */
  measuredIntelligenceBoundaryNote: 'MEASURED_INTELLIGENCE_NOT_ASSESSED_IS_NOT_N16_RESULT';
  dataSelection: LvOperationalGeDataSelectionV1 & {
    historicalObservationsTruncated: boolean;
    inputCoverageIncomplete: boolean;
    historicalQueryMode: 'DATE_RANGE_ASC' | 'RECENT_DESC_LIMIT';
  };
  /** P1 baseline (production decision path); unchanged default semantics. */
  assessment: LvEstimatedBatteryHealthAssessmentV1;
  /**
   * P11 condition policy (shadow-only). Never used for customer publication.
   * Disabled by default in product surfaces — exposed only via this Master Admin read API.
   */
  p11ShadowAssessment: LvEstimatedBatteryHealthAssessmentV1;
};
