import type {
  M3_3_HV_H4_BOUNDED_CHARGE_THROUGHPUT_V1,
  M3_3_HV_H4_CHARGE_THROUGHPUT_REPORT_V1,
  M3_3_HV_H4_COVERAGE_REPORT_V1,
  M3_3_HV_H4_EXPOSURE_SOURCE_AUTHORITY_V1,
} from './m3-3-hv-h4.constants';
import type {
  M3_3HvH4CoverageGapSummaryV1,
  M3_3HvH4CoverageClass,
  M3_3HvH4FutureThroughputEligibility,
  M3_3HvH4RetentionContinuity,
  M3_3HvH4RetentionInferenceKind,
  M3_3HvH4SegmentEvidenceState,
} from './m3-3-hv-h4.types';

export type M3_3HvH4ChargeThroughputCompositionStatus =
  | 'AVAILABLE_OBSERVED_GAP_AWARE'
  | 'NO_TRUSTED_SESSIONS'
  | 'SOURCE_TRUNCATED'
  | 'SOURCE_CONFLICT'
  | 'INVALID_SOURCE_EVIDENCE';

export type M3_3HvH4ChargeThroughputContributionEligibility =
  | 'ELIGIBLE_CONTRIBUTOR'
  | 'INELIGIBLE_NON_POSITIVE_ENERGY'
  | 'INELIGIBLE_INVALID_ADDED_ENERGY_PROVENANCE'
  | M3_3HvH4FutureThroughputEligibility
  | 'CONTEXT_ONLY';

export interface M3_3HvH4ChargeThroughputSessionClassificationV1 {
  sessionId: string;
  lifecycleSegmentId: string;
  contributionEligibility: M3_3HvH4ChargeThroughputContributionEligibility;
  reasonCodes: string[];
}

export interface M3_3HvH4LifecycleChargeThroughputSegmentV1 {
  lifecycleSegmentId: string;
  compositionStatus: M3_3HvH4ChargeThroughputCompositionStatus;
  boundedObservedChargeThroughputKwh: number | null;
  unit: 'kWh';
  throughputDirection: 'CHARGE_ONLY';
  throughputSemantic: 'PROVIDER_REPORTED_CHARGING_ADDED_ENERGY_DELTA';
  coverageClass: M3_3HvH4CoverageClass;
  coverageCompletenessClaim: 'OBSERVED_ELIGIBLE_SESSIONS_ONLY';
  segmentEvidenceState: M3_3HvH4SegmentEvidenceState;
  firstIncludedSessionStartAt: string | null;
  lastIncludedSessionEndAt: string | null;
  includedSessionCount: number;
  excludedSessionCount: number;
  excludedCountsByEligibility: Record<string, number>;
  earliestObservedAt: string | null;
  earliestTrustedAt: string | null;
  retentionContinuity: M3_3HvH4RetentionContinuity;
  retentionInference: M3_3HvH4RetentionInferenceKind;
  gapSummary: M3_3HvH4CoverageGapSummaryV1;
  sourceFingerprint: string;
  lifetimeComplete: false;
  bidirectionalThroughput: false;
  fecEligible: false;
  degradationNormalizationEligible: false;
  customerPublicationEligible: false;
  reasonCodes: string[];
}

export interface M3_3HvH4ChargeThroughputReportV1 {
  contractVersion: typeof M3_3_HV_H4_BOUNDED_CHARGE_THROUGHPUT_V1;
  reportVersion: typeof M3_3_HV_H4_CHARGE_THROUGHPUT_REPORT_V1;
  exposureSourceAuthorityVersion: typeof M3_3_HV_H4_EXPOSURE_SOURCE_AUTHORITY_V1;
  coverageReportVersion: typeof M3_3_HV_H4_COVERAGE_REPORT_V1;
  organizationId: string;
  vehicleId: string;
  evaluationAt: string;
  throughputDirection: 'CHARGE_ONLY';
  bidirectionalThroughput: false;
  lifetimeComplete: false;
  customerPublicationEligible: false;
  automaticRuntimeReachable: false;
  segments: M3_3HvH4LifecycleChargeThroughputSegmentV1[];
  sessionClassifications: M3_3HvH4ChargeThroughputSessionClassificationV1[];
  chargeSessionSourceLoad: {
    loadedCount: number;
    hardLimit: number;
    sourceTruncated: boolean;
    hardLimitReached: boolean;
  };
  energySemanticFirewall: {
    chargeThroughputSource: 'HvChargeSession.energyAddedKwh';
    prohibitedChargeThroughputSources: string[];
    pass: boolean;
  };
}
