import type {
  BatteryHealthStatus,
  NormalizedBatteryType,
  RestingThresholdSource,
  RestingVoltageStatus,
} from '../../battery-status';
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
  | 'REST_STABILIZATION_UNVERIFIED'
  | 'TEMPERATURE_MISSING_WHERE_REQUIRED'
  | 'CONTEXT_LIMITED_SLOPE_ONLY'
  | 'REST_VOLTAGE_GOOD'
  | 'REST_VOLTAGE_WATCH'
  | 'REST_VOLTAGE_WARNING'
  | 'REST_VOLTAGE_CRITICAL'
  | 'REST_CHARGE_BAND_NOT_EVALUABLE'
  | 'REST_CHARGE_BAND_COARSE_ONLY'
  | 'MANUAL_BATTERY_SPEC_NOT_PHYSICALLY_VERIFIED'
  | 'STARTABILITY_NOT_OBSERVED'
  | 'STARTABILITY_WAKE_WITHOUT_VALIDATED_SIGNATURE'
  | 'STARTABILITY_MISSING_PRE_START_REFERENCE'
  | 'STARTABILITY_MISSING_LOAD_SIGNATURE'
  | 'STARTABILITY_GE_SEQUENCE_NOT_CRANK_PROOF'
  | 'STARTABILITY_MISSING_CRANK_LOAD_EVIDENCE'
  | 'STARTABILITY_CRANK_EVIDENCE_VALIDATED';

export type LvOperationalDataQualityStatusV1 = 'ADEQUATE' | 'DEGRADED' | 'INSUFFICIENT';

export type LvOperationalConditionChemistryAuthorityV1 = {
  normalizedType: NormalizedBatteryType;
  batterySpecId: string | null;
  sourceType: string | null;
  sourceConfidence: number | null;
  nominalVoltageV: number | null;
  ampereHours: number | null;
  authority: 'VEHICLE_BATTERY_SPEC' | 'NONE';
  /**
   * Resting-voltage band thresholds are sourced from `battery-status.ts`
   * (`classifyRestingVoltage` — AGM vs DEFAULT lead-acid/EFB). Not a calibrated SoC model.
   */
  restingThresholdAuthority: 'BATTERY_STATUS_CLASSIFY_RESTING_VOLTAGE_V1';
};

export type LvOperationalConditionObservationV1 = {
  observationId: string;
  sourceMeasurementId: string;
  restSessionId: string | null;
  voltageV: number;
  voltageObservedAt: string;
  providerObservationAt: string | null;
  operationalContext: 'REST' | 'CHARGING' | 'DRIVING' | 'UNKNOWN';
  evidenceClass: string;
  actualRestAgeHours: number | null;
  temperatureC: number | null;
  isLvCharging: boolean | null;
  engineRunning: boolean | null;
};

export type LvOperationalCrankEvidenceV1 = {
  source: 'BATTERY_FEATURES';
  crankTripId: string | null;
  crankAtIso: string | null;
  vPreCrankV: number | null;
  vMinCrankV: number | null;
  crankDropV: number | null;
  vRecovery5sV: number | null;
  vRecovery30sV: number | null;
  crankObservationCount: number;
};

export type LvOperationalConditionSessionFeatureV1 = {
  restSessionId: string;
  robustRestSlopeMvPerHour: number | null;
  slopeInterpretability: 'REST_SELF_DISCHARGE_TREND' | 'CONTEXT_LIMITED';
  slopeLimitationCodes: string[];
  numberOfValidRestPoints: number | null;
  observationSpanMs: number | null;
};

export type LvOperationalGeDataSelectionV1 = {
  rawVoltageRowCount: number;
  dedupedVoltageRowCount: number;
  eligibleRestObservationCount: number;
  measuredFromIso: string | null;
  measuredToIso: string | null;
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
  geDataSelection: LvOperationalGeDataSelectionV1;
  eligibleRestObservations: LvOperationalConditionObservationV1[];
  /**
   * Full deduped GE timeline for shadow P11 pre-start/wake analysis only.
   * Not consumed by N14 production evaluation.
   */
  assessmentTimelineObservations: LvOperationalConditionObservationV1[];
  latestGlobalObservation: LvOperationalConditionObservationV1 | null;
  latestEligibleRestObservation: LvOperationalConditionObservationV1 | null;
  wakeVoltageObservations: LvOperationalConditionObservationV1[];
  sessionFeatures: LvOperationalConditionSessionFeatureV1[];
  crankEvidence: LvOperationalCrankEvidenceV1 | null;
};

export type LvOperationalRestingChargeBandV1 = {
  qualification: 'NOT_EVALUABLE' | 'COARSE_BAND_ONLY';
  bandStatus: BatteryHealthStatus | 'UNSUPPORTED' | null;
  reasonCodes: LvOperationalConditionReasonCodeV1[];
};

export type LvOperationalConditionAssessmentV1 = {
  modelVersion: string;
  organizationId: string;
  vehicleId: string;
  evaluatedAtIso: string;
  restingVoltageBand: RestingVoltageStatus | 'NOT_EVALUABLE';
  restingThresholdSource: RestingThresholdSource | 'NONE';
  restingChargeBand: LvOperationalRestingChargeBandV1;
  operationalRiskStatus: LvOperationalConditionStatusV1;
  dataQuality: LvOperationalDataQualityStatusV1;
  assessmentConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  chemistry: LvOperationalConditionChemistryAuthorityV1;
  startabilityStatus: LvOperationalConditionStatusV1;
  startabilityCrankDropBand: BatteryHealthStatus | 'UNKNOWN';
  crankEvidence: LvOperationalCrankEvidenceV1 | null;
  latestEligibleRestAgeHours: number | null;
  actualStateOfHealth: 'UNKNOWN';
  evidenceObservationIds: string[];
  dataFreshnessObservedAt: string | null;
  reasonCodes: LvOperationalConditionReasonCodeV1[];
  limitations: string[];
  eligibleRestObservationCount: number;
  qualifiedRestEpisodeCount: number;
  qualifiedRestVoltageMv: {
    min: number | null;
    max: number | null;
    median: number | null;
    sampleCount: number;
  };
};
