import type { LvEstimatedBatteryHealthAssessmentV1 } from '../vehicle-intelligence/battery-health/generalized-evidence/lv-estimated-battery-health/lv-estimated-battery-health-v1.types';
import type { LvOperationalGeDataSelectionV1 } from '../vehicle-intelligence/battery-health/generalized-evidence/lv-operational-condition/lv-operational-condition-v1.types';

export type LvEstimatedBatteryHealthShadowAdminV1 = {
  shadowContractVersion: 'LV_ESTIMATED_BATTERY_HEALTH_SHADOW_ADMIN_V1';
  organizationId: string;
  vehicleId: string;
  evaluatedAtIso: string;
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
  assessment: LvEstimatedBatteryHealthAssessmentV1;
};
