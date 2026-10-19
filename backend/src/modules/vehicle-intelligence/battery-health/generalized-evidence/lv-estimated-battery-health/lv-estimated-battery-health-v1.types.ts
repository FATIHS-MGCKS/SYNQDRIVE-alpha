import type { LvOperationalConditionAssessmentV1 } from '../lv-operational-condition/lv-operational-condition-v1.types';
import type { LvOperationalConditionInputV1 } from '../lv-operational-condition/lv-operational-condition-v1.types';

export type LvEstimatedHealthStatusV1 = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

export type LvEstimatedHealthSignalFamilyV1 =
  | 'RESTING_CONDITION'
  | 'LONGITUDINAL_STABILITY'
  | 'LOAD_START_PERFORMANCE'
  | 'CHARGING_RECOVERY_CONTEXT';

export type LvEstimatedHealthReasonCodeV1 =
  | 'HEALTH_INSUFFICIENT_INDEPENDENT_EPISODES'
  | 'HEALTH_CHEMISTRY_UNKNOWN'
  | 'HEALTH_PROVIDER_GAP_OPEN'
  | 'HEALTH_INPUT_TRUNCATED'
  | 'HEALTH_TEMPERATURE_UNAVAILABLE'
  | 'HEALTH_MANUAL_SPEC_UNVERIFIED'
  | 'HEALTH_REST_EPISODES_STABLE_GOOD'
  | 'HEALTH_REST_EPISODES_WATCH'
  | 'HEALTH_REST_EPISODES_WARNING'
  | 'HEALTH_REST_EPISODES_CRITICAL'
  | 'HEALTH_SINGLE_EPISODE_ONLY'
  | 'HEALTH_TEMPORARILY_DISCHARGED_NOT_AGING'
  | 'HEALTH_LONGITUDINAL_DECLINE_SUSPECTED'
  | 'HEALTH_LONGITUDINAL_STABLE'
  | 'HEALTH_LONGITUDINAL_NOT_EVALUABLE'
  | 'HEALTH_LOAD_CRANK_VALIDATED_GOOD'
  | 'HEALTH_LOAD_CRANK_VALIDATED_WEAK'
  | 'HEALTH_LOAD_CRANK_VALIDATED_CRITICAL'
  | 'HEALTH_LOAD_CRANK_STALE'
  | 'HEALTH_LOAD_CRANK_UNAVAILABLE'
  | 'HEALTH_LOAD_CONTRADICTS_REST_GREEN'
  | 'HEALTH_CHARGING_CONTAMINATION_HIGH'
  | 'HEALTH_CHARGING_CONTEXT_LIMITED'
  | 'HEALTH_CONFLICTING_SIGNALS'
  | 'HEALTH_N14_OPERATIONAL_RISK_NOT_HEALTH_PROXY'
  | 'HEALTH_PUBLICATION_NOT_ELIGIBLE'
  | 'HEALTH_PROVISIONAL_INTERNAL_ONLY';

export type LvEstimatedHealthAssessmentEligibilityV1 =
  | 'NOT_ASSESSABLE'
  | 'PROVISIONAL_INTERNAL_ONLY'
  | 'NOT_PUBLICATION_READY';

export type LvEstimatedHealthConfidenceV1 = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export type LvEstimatedBatteryHealthInputV1 = {
  conditionInput: LvOperationalConditionInputV1;
  /** Historic measurements at or after this instant are tagged post-restore for reporting only. */
  restoreCutoffIso: string;
  postRestoreObservationCount: number;
};

export type LvEstimatedHealthEvidenceCountsV1 = {
  eligibleRestObservations: number;
  qualifiedRestEpisodes: number;
  episodeRestGood: number;
  episodeRestWatch: number;
  episodeRestWarning: number;
  episodeRestCritical: number;
  wakeObservations: number;
  sessionFeaturesEvaluable: number;
  openProviderGaps: number;
  postRestoreGeObservations: number;
};

export type LvEstimatedBatteryHealthAssessmentV1 = {
  modelVersion: string;
  organizationId: string;
  vehicleId: string;
  evaluatedAtIso: string;
  estimatedHealthStatus: LvEstimatedHealthStatusV1;
  estimateConfidence: LvEstimatedHealthConfidenceV1;
  assessmentEligibility: LvEstimatedHealthAssessmentEligibilityV1;
  supportingSignalFamilies: LvEstimatedHealthSignalFamilyV1[];
  missingSignalFamilies: LvEstimatedHealthSignalFamilyV1[];
  evidenceCounts: LvEstimatedHealthEvidenceCountsV1;
  dataFreshnessObservedAt: string | null;
  reasonCodes: LvEstimatedHealthReasonCodeV1[];
  limitations: string[];
  measuredSOH: 'UNKNOWN';
  /** Shadow-only companion; N14 semantics unchanged. */
  n14OperationalRiskStatus: LvOperationalConditionAssessmentV1['operationalRiskStatus'];
  n14StartabilityStatus: LvOperationalConditionAssessmentV1['startabilityStatus'];
  customerPublicationEnabled: false;
};
