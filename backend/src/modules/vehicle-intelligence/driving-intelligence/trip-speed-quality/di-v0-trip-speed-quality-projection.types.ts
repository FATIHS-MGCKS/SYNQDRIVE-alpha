import type { DiV0S4SourceFamily } from '../s4a-foundation/di-v0-s4a-contract';
import type { DiV0SpeedQcReasonCode } from '../speed-qc/di-v0-speed-qc-reason-codes';
import type { DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1 } from './di-v0-trip-speed-quality-projection.version';

export type DiV0TripSpeedQualityAssessability = 'FULL' | 'PARTIAL' | 'INSUFFICIENT' | 'UNASSESSABLE';

export type DiV0TripSpeedMaxAssessability =
  | 'TRUSTED_MAX_AVAILABLE'
  | 'TRUSTED_LIMITED_ONLY'
  | 'SHADOW_RAW_ONLY'
  | 'UNAVAILABLE';

export interface DiV0TripSpeedQualityTrustedDistributionBand {
  label: string;
  minKmhInclusive: number;
  maxKmhExclusive: number | null;
  trustedIntervalCount: number;
}

export interface DiV0TripSpeedQualityProjectionIdentityV1 {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  workItemId: string;
  shadowRunId: string;
  pinnedSnapshotHash: string;
  boundaryFingerprint: string;
  qcPolicyVersion: string;
  projectionVersion: typeof DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1;
}

export interface DiV0TripSpeedQualityProjectionQualityV1 {
  totalIntervalCount: number;
  numericSpeedCount: number;
  trustedNumericCount: number;
  trustedLimitedCount: number;
  trustedLimitedStationaryCount: number;
  trustedLimitedNumericCount: number;
  untrustedCount: number;
  /** Share of intervals with any numeric speed estimate (shadow), 0–100. */
  numericCoveragePercent: number | null;
  /** Share of intervals with trustLevel TRUSTED (numeric QC), 0–100. */
  trustedNumericCoveragePercent: number | null;
  /** Share of intervals with trustLevel TRUSTED_LIMITED, 0–100. */
  trustedLimitedCoveragePercent: number | null;
  /** Share of intervals that are not UNTRUSTED (TRUSTED + TRUSTED_LIMITED), 0–100. */
  nonUntrustedCoveragePercent: number | null;
  /**
   * @deprecated Use trustedNumericCoveragePercent — kept for JSON backward compatibility in V1 rows.
   */
  trustedCoveragePercent: number | null;
  reasonCodeBreakdown: Partial<Record<DiV0SpeedQcReasonCode, number>>;
  missingEvidenceCount: number;
  sourceConflictCount: number;
}

export interface DiV0TripSpeedQualityProjectionSpeedV1 {
  shadowRawMaxKmh: number | null;
  /** Max speed from intervals with trustLevel TRUSTED only (excludes TRUSTED_LIMITED). */
  qcTrustedMaxKmh: number | null;
  /**
   * Mean of qcTrustedSpeedKmh over TRUSTED intervals only — not a whole-trip average claim.
   * Documented as trusted-interval subset mean.
   */
  qcTrustedMeanKmh: number | null;
  trustedSpeedDistribution: DiV0TripSpeedQualityTrustedDistributionBand[];
  maxSpeedAssessability: DiV0TripSpeedMaxAssessability;
}

export interface DiV0TripSpeedQualityProjectionMotionV1 {
  stationarySupportedCount: number;
  movingEstimatedCount: number;
  movingUnknownCount: number;
  uncertainCount: number;
  noMotionEvidenceCount: number;
}

export interface DiV0TripSpeedQualityProjectionAssessabilityV1 {
  level: DiV0TripSpeedQualityAssessability;
  reasons: string[];
  assessabilityCriteriaVersion: string;
  provisionalCalibration: true;
  customerClaimAuthorized: false;
}

export interface DiV0TripSpeedQualityProjectionProvenanceV1 {
  sourceFamily: DiV0S4SourceFamily;
  qcPolicyVersion: string;
  projectionVersion: typeof DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1;
  combinedInputIdentity: string | null;
  shadowInputEvidenceVersion: string | null;
  workItemCompletedAt: string | null;
}

/** Canonical internal ops read model (not customer API). */
export interface DiV0TripSpeedQualityProjectionV1 {
  identity: DiV0TripSpeedQualityProjectionIdentityV1;
  quality: DiV0TripSpeedQualityProjectionQualityV1;
  speed: DiV0TripSpeedQualityProjectionSpeedV1;
  motion: DiV0TripSpeedQualityProjectionMotionV1;
  assessability: DiV0TripSpeedQualityProjectionAssessabilityV1;
  provenance: DiV0TripSpeedQualityProjectionProvenanceV1;
}
