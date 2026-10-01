import type {
  M3_3_HV_H4_COVERAGE_REPORT_V1,
  M3_3_HV_H4_EXPOSURE_SOURCE_AUTHORITY_V1,
} from './m3-3-hv-h4.constants';

export type M3_3HvH4ExposureAxis =
  | 'CALENDAR_TIME'
  | 'ODOMETER_KM'
  | 'CHARGE_THROUGHPUT_KWH'
  | 'FULL_EQUIVALENT_CYCLES'
  | 'TEMPERATURE_EXPOSURE'
  | 'SOC_WINDOW_EXPOSURE'
  | 'FAST_CHARGE_EXPOSURE';

export type M3_3HvH4CoverageClass =
  | 'ABSOLUTE_LIFECYCLE'
  | 'BOUNDED_CONTIGUOUS'
  | 'BOUNDED_GAP_AWARE'
  | 'POINT_CONTEXT_ONLY'
  | 'UNAVAILABLE';

export type M3_3HvH4SemanticAuthority =
  | 'OBSERVATION_CALENDAR_TIME'
  | 'PHYSICAL_BATTERY_AGE'
  | 'VEHICLE_ODOMETER_POINT'
  | 'PROVIDER_CHARGING_ADDED_ENERGY_SESSION'
  | 'STORED_TRACTION_ENERGY_DELTA_PRODUCT'
  | 'FEC_UNDEFINED'
  | 'BATTERY_TEMPERATURE_POINT'
  | 'SOC_PERCENT_POINT'
  | 'CHARGING_POWER_POINT'
  | 'NONE';

export type M3_3HvH4SourceAuthorityClass =
  | 'POSTGRES_CANONICAL'
  | 'POSTGRES_POINT_HISTORY'
  | 'POSTGRES_SESSION_EPISODE'
  | 'CLICKHOUSE_SUPPORTING_ONLY'
  | 'NONE';

export type M3_3HvH4RetentionContinuity =
  | 'RAW_PRESERVED'
  | 'AGGREGATE_PRESERVED'
  | 'WINDOW_LIMITED'
  | 'UNKNOWN';

export type M3_3HvH4EvidenceBoundaryKind =
  | 'FIRST_DURABLE_OBSERVATION'
  | 'FIRST_QUALIFIED_SESSION'
  | 'LIFECYCLE_REPLACEMENT_BOUNDARY'
  | 'SOURCE_ENABLEMENT_BOUNDARY'
  | 'RETENTION_BOUNDARY'
  | 'UNKNOWN';

export type M3_3HvH4GapKind = 'KNOWN_GAP' | 'POSSIBLE_GAP' | 'TRUNCATED_HISTORY';

/** Actual segment-level evidence presence (distinct from static axis coverage class). */
export type M3_3HvH4SegmentEvidenceState =
  | 'NO_OBSERVED_SOURCE'
  | 'OBSERVED_CONTEXT_ONLY'
  | 'TRUSTED_SOURCE_PRESENT';

export type M3_3HvH4RetentionInferenceKind =
  | 'RETENTION_POLICY_WINDOW_LIMITED'
  | 'RETENTION_TRUNCATION_POSSIBLE'
  | 'ACTUAL_RETENTION_TRUNCATION_CONFIRMED'
  | 'NO_RETENTION_TRUNCATION_EVIDENCE';

export type M3_3HvH4FutureThroughputEligibility =
  | 'ELIGIBLE_NATIVE'
  | 'ELIGIBLE_FALLBACK_WITH_MATCHING_SEMANTIC'
  | 'INELIGIBLE_ONGOING'
  | 'INELIGIBLE_SUPERSEDED'
  | 'INELIGIBLE_MISSING_ENERGY'
  | 'INELIGIBLE_REPLACEMENT_INTERSECTION'
  | 'INELIGIBLE_QUALITY'
  | 'CONTEXT_ONLY';

export interface M3_3HvH4ExposureAxisAuthorityV1 {
  axis: M3_3HvH4ExposureAxis;
  unit: string | null;
  semanticAuthority: M3_3HvH4SemanticAuthority;
  coverageClass: M3_3HvH4CoverageClass;
  sourceAuthorityClass: M3_3HvH4SourceAuthorityClass;
  lifecycleScope: 'PER_HV_LIFECYCLE_SEGMENT' | 'VEHICLE_LEVEL';
  retentionContinuity: M3_3HvH4RetentionContinuity;
  replacementSegmentable: boolean;
  integrationAllowed: boolean;
  normalizationAllowed: boolean;
  customerUseAllowed: boolean;
}

export interface M3_3HvH4ExposureEvidenceStartV1 {
  axis: M3_3HvH4ExposureAxis;
  organizationId: string;
  vehicleId: string;
  lifecycleSegmentId: string;
  earliestObservedAt: string | null;
  earliestTrustedAt: string | null;
  source: string;
  sourceIdentity: string;
  boundaryKind: M3_3HvH4EvidenceBoundaryKind;
  completenessFromBoundary: M3_3HvH4CoverageClass;
  reasonCodes: string[];
}

export interface M3_3HvH4CoverageGapSummaryV1 {
  gapKind: M3_3HvH4GapKind;
  reasonCodes: string[];
}

export interface M3_3HvH4SourceSummaryV1 {
  source: string;
  earliestObservedAt: string | null;
  latestObservedAt: string | null;
  rowCount: number;
  retentionContinuity: M3_3HvH4RetentionContinuity;
  notes: string[];
}

export interface M3_3HvH4AxisCoverageEntryV1 {
  axis: M3_3HvH4ExposureAxis;
  lifecycleSegmentId: string;
  coverageClass: M3_3HvH4CoverageClass;
  semanticAuthority: M3_3HvH4SemanticAuthority;
  segmentEvidenceState: M3_3HvH4SegmentEvidenceState;
  earliestObservedAt: string | null;
  earliestTrustedAt: string | null;
  latestObservedAt: string | null;
  retentionContinuity: M3_3HvH4RetentionContinuity;
  retentionInference: M3_3HvH4RetentionInferenceKind;
  replacementSegmentable: boolean;
  sourceSummaries: M3_3HvH4SourceSummaryV1[];
  gapSummary: M3_3HvH4CoverageGapSummaryV1;
  integrationAllowed: boolean;
  reasonCodes: string[];
  evidenceStart: M3_3HvH4ExposureEvidenceStartV1;
}

export interface M3_3HvH4LifecycleSegmentRefV1 {
  lifecycleSegmentId: string;
  segmentIndex: number;
  replacementBoundaryEffectiveAt: string | null;
}

export interface M3_3HvH4ChargeSessionSourceClassificationV1 {
  sessionId: string;
  lifecycleSegmentId: string;
  futureThroughputEligibility: M3_3HvH4FutureThroughputEligibility;
  reasonCodes: string[];
}

export interface M3_3HvH4CoverageReportV1 {
  contractVersion: typeof M3_3_HV_H4_EXPOSURE_SOURCE_AUTHORITY_V1;
  reportVersion: typeof M3_3_HV_H4_COVERAGE_REPORT_V1;
  organizationId: string;
  vehicleId: string;
  evaluationAt: string;
  lifecycleSegments: M3_3HvH4LifecycleSegmentRefV1[];
  axisAuthorities: M3_3HvH4ExposureAxisAuthorityV1[];
  axes: M3_3HvH4AxisCoverageEntryV1[];
  chargeSessionClassifications: M3_3HvH4ChargeSessionSourceClassificationV1[];
  energySemanticFirewall: {
    chargeThroughputSource: 'HvChargeSession.energyAddedKwh';
    prohibitedChargeThroughputSources: string[];
    pass: boolean;
  };
  retentionAuthority: {
    existingAggregatesPreserveChargeThroughput: false;
    hvChargeSessionRetentionDaysDefault: number;
    hvSnapshotRetentionDaysDefault: number;
    retentionBoundaryDistinctFromEvidenceStart: true;
  };
  chargeSessionSourceLoad: {
    loadedCount: number;
    hardLimit: number;
    sourceTruncated: boolean;
    hardLimitReached: boolean;
  };
  automaticRuntimeReachable: false;
  customerPublicationEligible: false;
  cumulativeExposureValues: false;
}

export type M3_3HvH4ExposureSourceAuthorityContractV1 = {
  version: typeof M3_3_HV_H4_EXPOSURE_SOURCE_AUTHORITY_V1;
  axes: M3_3HvH4ExposureAxisAuthorityV1[];
};
