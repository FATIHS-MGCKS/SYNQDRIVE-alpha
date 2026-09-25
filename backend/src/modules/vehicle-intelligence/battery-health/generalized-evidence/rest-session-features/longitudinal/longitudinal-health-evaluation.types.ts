import type { M3_3E_LongitudinalAssessmentInputV1 } from './longitudinal-assessment-input.types';
import type {
  M3_3E_CALIBRATION_MATURITY_V1,
  M3_3E_E2_MODEL_POLICY_VERSION,
  M3_3E_HEALTH_EVALUATION_CONTRACT_VERSION,
  M3_3E_HEALTH_EVALUATION_REASON_CODE_V1,
  M3_3E_HEALTH_PRIMARY_METRIC_V1,
} from './longitudinal-health-evaluation.constants';
import type { M3_3E_CALIBRATION_PROFILE_ID_V1 } from './longitudinal-health-calibration-profile';
import type { LongitudinalProfileVersionTupleV1 } from './longitudinal-profile.types';

export type M3_3E_HealthEvaluationRejectReason =
  | 'M3_3E_EVALUATION_UNSUPPORTED_INPUT_CONTRACT_VERSION'
  | 'M3_3E_EVALUATION_IDENTITY_INVALID'
  | 'M3_3E_EVALUATION_CONSUMPTION_FINGERPRINT_MISMATCH'
  | 'M3_3E_EVALUATION_MALFORMED_ANCHOR_AT'
  | 'M3_3E_EVALUATION_DUPLICATE_REST_SESSION_ID'
  | 'M3_3E_EVALUATION_SEGMENT_METADATA_INCONSISTENT'
  | 'M3_3E_EVALUATION_OBSERVATION_SEGMENT_MISMATCH'
  | 'M3_3E_EVALUATION_NON_ASCENDING_OBSERVATIONS'
  | 'M3_3E_EVALUATION_EVIDENCE_WINDOW_INCONSISTENT'
  | 'M3_3E_EVALUATION_MODEL_INPUT_AVAILABILITY_MISMATCH'
  | 'M3_3E_EVALUATION_SHUTDOWN_DELTA_ANCHOR_INCONSISTENT'
  | 'M3_3E_EVALUATION_UNSUPPORTED_CALIBRATION_PROFILE'
  | 'M3_3E_HEALTH_EVALUATION_NUMERIC_OVERFLOW';

export type M3_3E_HealthComparabilityState =
  | 'SAME_SEGMENT_COMPARABLE'
  | 'SAME_SEGMENT_CONTEXT_LIMITED'
  | 'CROSS_SEGMENT_NOT_COMPARABLE'
  | 'NOT_COMPARABLE_ANCHOR_UNRESOLVED'
  | 'NOT_COMPARABLE_CHARGE_CONTEXT_UNRESOLVED'
  | 'NOT_COMPARABLE_REST_DEPTH_UNALIGNED';

export type M3_3E_HealthSufficiencyState =
  | 'INSUFFICIENT_STRUCTURAL'
  | 'UNDETERMINED_CALIBRATION_REQUIRED'
  | 'INSUFFICIENT_CALIBRATED'
  | 'SUFFICIENT';

export type M3_3E_HealthTrendState =
  | 'NOT_EVALUABLE_INSUFFICIENT_STRUCTURAL'
  | 'NOT_COMPARABLE'
  | 'NOT_CLASSIFIED_CALIBRATION_NOT_ESTABLISHED'
  | 'NO_DIRECTIONAL_CHANGE_RESOLVED'
  | 'DIRECTIONAL_CHANGE_INCREASING'
  | 'DIRECTIONAL_CHANGE_DECREASING'
  | 'STEP_CHANGE_CANDIDATE'
  | 'INCONSISTENT';

export type M3_3E_HealthOutlierClass =
  | 'REPRESENTATIVE'
  | 'CONTEXTUAL_EXTREME'
  | 'STATISTICAL_OUTLIER'
  | 'CHANGE_POINT_CANDIDATE'
  | 'CORROBORATION_REQUIRED';

export type M3_3E_HealthEvaluationStatus = 'EVALUATED_DESCRIPTIVE_ONLY' | 'NO_CONCLUSION';

export type M3_3E_HealthClaimLevel = 'NONE' | 'MEASURED_DESCRIPTOR_CHANGE';

export type M3_3E_HealthConditionV1 = 'NOT_ASSESSED';

export type M3_3E_HealthConfidenceV1 = 'NOT_APPLICABLE' | 'LOW' | 'MODERATE' | 'HIGH';

export type M3_3E_HealthVehicleSummary =
  | 'NO_EVALUABLE_SEGMENT'
  | 'SINGLE_EVALUABLE_SEGMENT'
  | 'SEGMENTED_NO_POOLED_CONCLUSION';

export type M3_3E_KendallPairCountsV1 = {
  increasing: number;
  decreasing: number;
  tied: number;
};

export type M3_3E_HealthMetricStatisticsV1 = {
  seriesCount: number;
  distinctAnchorCount: number;
  seriesSpanMs: number;
  seriesMedianQuantized: number | null;
  theilSenSlopePerDayQuantized: number | null;
  kendallPairCounts: M3_3E_KendallPairCountsV1 | null;
  residualMadQuantized: number | null;
  stepChangeMagnitudeQuantized: number | null;
};

export type M3_3E_HealthMetricContextDescriptorsV1 = {
  temperature: {
    tripExteriorCount: number;
    unknownCount: number;
    knownMinC: number | null;
    knownMedianC: number | null;
    knownMaxC: number | null;
  };
  chargeClassCounts: Record<string, number>;
  restDepthRangeMs: { min: number | null; max: number | null };
  firstPointAgeRangeMs: { min: number | null; max: number | null };
};

export type M3_3E_HealthMetricEvaluationV1 = {
  metric: M3_3E_HEALTH_PRIMARY_METRIC_V1;
  comparability: M3_3E_HealthComparabilityState;
  sufficiency: M3_3E_HealthSufficiencyState;
  statistics: M3_3E_HealthMetricStatisticsV1;
  contextDescriptors: M3_3E_HealthMetricContextDescriptorsV1;
  trendState: M3_3E_HealthTrendState;
  outliers: Array<{ restSessionId: string; outlierClass: M3_3E_HealthOutlierClass }>;
  confidence: M3_3E_HealthConfidenceV1;
  reasonCodes: M3_3E_HEALTH_EVALUATION_REASON_CODE_V1[];
};

export type M3_3E_HealthSegmentEvaluationV1 = {
  sourceSegmentIndex: number;
  versionTuple: LongitudinalProfileVersionTupleV1;
  metrics: M3_3E_HealthMetricEvaluationV1[];
};

export type M3_3E_LongitudinalHealthEvaluationV1 = {
  contractVersion: typeof M3_3E_HEALTH_EVALUATION_CONTRACT_VERSION;
  modelPolicyVersion: typeof M3_3E_E2_MODEL_POLICY_VERSION;
  calibration: {
    calibrationProfileId: M3_3E_CALIBRATION_PROFILE_ID_V1;
    calibrationMaturity: M3_3E_CALIBRATION_MATURITY_V1;
    calibrationProfileFingerprint: string;
  };
  inputBinding: {
    inputContractVersion: M3_3E_LongitudinalAssessmentInputV1['contractVersion'];
    consumptionInputFingerprint: string;
    organizationId: string;
    vehicleId: string;
    revisionIdentity: {
      revisionId: string;
      canonicalProfileFingerprint: string;
      longitudinalProfileContractVersion: string;
      profilePolicyVersion: string;
      integrityInspectionContractVersion: string;
    };
  };
  evaluationStatus: M3_3E_HealthEvaluationStatus;
  noConclusionReasons: M3_3E_HEALTH_EVALUATION_REASON_CODE_V1[];
  claimLevel: M3_3E_HealthClaimLevel;
  condition: M3_3E_HealthConditionV1;
  segments: M3_3E_HealthSegmentEvaluationV1[];
  vehicleSummary: M3_3E_HealthVehicleSummary;
  resultFingerprint: string;
};

export type M3_3E_EvaluateHealthOutcome =
  | { status: 'OK'; evaluation: M3_3E_LongitudinalHealthEvaluationV1 }
  | { status: 'REJECTED'; reason: M3_3E_HealthEvaluationRejectReason };

export type M3_3E_EvaluateHealthArgs = {
  input: M3_3E_LongitudinalAssessmentInputV1;
  calibrationProfileId?: M3_3E_CALIBRATION_PROFILE_ID_V1;
};
