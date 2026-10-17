import type { NormalizedBatteryType } from '../../battery-status';
import type { LvMeasuredHistoricalQueryModeV1 } from '../lv-measured-intelligence/lv-measured-intelligence.types';

export type LvOperationalConditionStatusV1 = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

export type LvOperationalConditionReasonCodeV1 =
  | 'NO_ELIGIBLE_REST_OBSERVATIONS'
  | 'CHEMISTRY_UNSUPPORTED'
  | 'CHEMISTRY_UNKNOWN'
  | 'PROVIDER_GAP_OPEN'
  | 'INPUT_COVERAGE_TRUNCATED'
  | 'CHARGING_VOLTAGE_EXCLUDED'
  | 'DRIVING_VOLTAGE_EXCLUDED'
  | 'REST_AGE_TOO_SHORT'
  | 'TEMPERATURE_MISSING_WHERE_REQUIRED'
  | 'CONTEXT_LIMITED_SLOPE_ONLY'
  | 'REST_VOLTAGE_GOOD'
  | 'REST_VOLTAGE_WATCH'
  | 'REST_VOLTAGE_WARNING'
  | 'REST_VOLTAGE_CRITICAL'
  | 'SOC_ESTIMATE_NOT_SUPPORTED'
  | 'SOC_ESTIMATE_CONTEXT_LIMITED'
  | 'STARTABILITY_WAKE_OBSERVED'
  | 'STARTABILITY_NOT_OBSERVED';

export type LvOperationalConditionChemistryAuthorityV1 = {
  normalizedType: NormalizedBatteryType;
  batterySpecId: string | null;
  sourceType: string | null;
  sourceConfidence: number | null;
  nominalVoltageV: number | null;
  ampereHours: number | null;
  authority: 'VEHICLE_BATTERY_SPEC' | 'NONE';
};

export type LvOperationalConditionObservationV1 = {
  observationId: string;
  sourceMeasurementId: string;
  voltageV: number;
  voltageObservedAt: string;
  operationalContext: 'REST' | 'CHARGING' | 'DRIVING' | 'UNKNOWN';
  evidenceClass: string;
  actualRestAgeHours: number | null;
  temperatureC: number | null;
  isLvCharging: boolean | null;
  engineRunning: boolean | null;
};

export type LvOperationalConditionSessionFeatureV1 = {
  restSessionId: string;
  robustRestSlopeMvPerHour: number | null;
  slopeInterpretability: 'REST_SELF_DISCHARGE_TREND' | 'CONTEXT_LIMITED';
  slopeLimitationCodes: string[];
  numberOfValidRestPoints: number | null;
  observationSpanMs: number | null;
};

export type LvOperationalConditionInputV1 = {
  modelVersion: string;
  organizationId: string;
  vehicleId: string;
  evaluatedAtIso: string;
  chemistry: LvOperationalConditionChemistryAuthorityV1;
  openProviderObservabilityGapCount: number;
  historicalQueryMode: LvMeasuredHistoricalQueryModeV1;
  inputCoverageIncomplete: boolean;
  historicalObservationsTruncated: boolean;
  eligibleRestObservations: LvOperationalConditionObservationV1[];
  latestGlobalObservation: LvOperationalConditionObservationV1 | null;
  wakeVoltageObservations: LvOperationalConditionObservationV1[];
  sessionFeatures: LvOperationalConditionSessionFeatureV1[];
};

export type LvOperationalSocEstimationV1 = {
  status: 'EVALUABLE' | 'NOT_EVALUABLE' | 'UNKNOWN';
  estimatedSocPercent: number | null;
  reasonCodes: LvOperationalConditionReasonCodeV1[];
};

export type LvOperationalConditionAssessmentV1 = {
  modelVersion: string;
  organizationId: string;
  vehicleId: string;
  evaluatedAtIso: string;
  operationalRiskStatus: LvOperationalConditionStatusV1;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  chemistry: LvOperationalConditionChemistryAuthorityV1;
  socEstimation: LvOperationalSocEstimationV1;
  startabilityStatus: LvOperationalConditionStatusV1;
  actualStateOfHealth: 'UNKNOWN';
  evidenceObservationIds: string[];
  dataFreshnessObservedAt: string | null;
  reasonCodes: LvOperationalConditionReasonCodeV1[];
  limitations: string[];
  eligibleRestObservationCount: number;
  qualifiedRestVoltageMv: {
    min: number | null;
    max: number | null;
    median: number | null;
    sampleCount: number;
  };
};
