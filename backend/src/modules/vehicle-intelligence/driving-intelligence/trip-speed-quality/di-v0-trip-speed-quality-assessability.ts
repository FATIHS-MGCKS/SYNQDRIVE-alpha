import { DI_V0_TRIP_SPEED_QUALITY_ASSESSABILITY_CRITERIA_V1 } from './di-v0-trip-speed-quality-assessability-criteria.v1';
import type {
  DiV0TripSpeedQualityProjectionAssessabilityV1,
  DiV0TripSpeedQualityProjectionQualityV1,
  DiV0TripSpeedMaxAssessability,
  DiV0TripSpeedQualityProjectionSpeedV1,
} from './di-v0-trip-speed-quality-projection.types';

export function resolveDiV0TripSpeedMaxAssessability(input: {
  trustedNumericCount: number;
  trustedLimitedCount: number;
  qcTrustedMaxKmh: number | null;
  shadowRawMaxKmh: number | null;
}): DiV0TripSpeedMaxAssessability {
  if (input.trustedNumericCount > 0 && input.qcTrustedMaxKmh != null) {
    return 'TRUSTED_MAX_AVAILABLE';
  }
  if (input.trustedLimitedCount > 0) {
    return 'TRUSTED_LIMITED_ONLY';
  }
  if (input.shadowRawMaxKmh != null) {
    return 'SHADOW_RAW_ONLY';
  }
  return 'UNAVAILABLE';
}

export function deriveDiV0TripSpeedQualityAssessability(
  quality: DiV0TripSpeedQualityProjectionQualityV1,
  speed: Pick<DiV0TripSpeedQualityProjectionSpeedV1, 'maxSpeedAssessability'>,
  snapshotVerified: boolean,
): DiV0TripSpeedQualityProjectionAssessabilityV1 {
  const criteria = DI_V0_TRIP_SPEED_QUALITY_ASSESSABILITY_CRITERIA_V1;
  const reasons: string[] = [];
  const base = {
    assessabilityCriteriaVersion: criteria.criteriaVersion,
    provisionalCalibration: true as const,
    customerClaimAuthorized: false as const,
  };
  if (!snapshotVerified) {
    reasons.push('SNAPSHOT_NOT_VERIFIED');
    return {
      level: 'UNASSESSABLE',
      reasons,
      ...base,
    };
  }
  if (quality.numericSpeedCount === 0) {
    reasons.push('NO_NUMERIC_SPEED_INTERVALS');
    return {
      level: 'UNASSESSABLE',
      reasons,
      ...base,
    };
  }
  if (quality.trustedNumericCount === 0 && quality.trustedLimitedCount === 0) {
    reasons.push('NO_TRUSTED_OR_LIMITED_INTERVALS');
    return {
      level: 'INSUFFICIENT',
      reasons,
      ...base,
    };
  }
  const trustedNumericCoverage = quality.trustedNumericCoveragePercent ?? 0;
  const meetsFullNumericCoverage =
    trustedNumericCoverage >= criteria.full.minTrustedNumericCoveragePercent &&
    quality.trustedNumericCount >= criteria.full.minTrustedNumericIntervalCount;
  if (meetsFullNumericCoverage) {
    reasons.push('TRUSTED_NUMERIC_COVERAGE_HIGH_PROVISIONAL');
    return {
      level: 'FULL',
      reasons,
      ...base,
    };
  }
  if (
    quality.trustedNumericCount >= criteria.partial.minTrustedNumericIntervalCount ||
    quality.trustedLimitedCount > 0
  ) {
    reasons.push('TRUSTED_COVERAGE_PARTIAL');
    if (quality.trustedNumericCount === 0 && quality.trustedLimitedCount > 0) {
      reasons.push('TRUSTED_LIMITED_ONLY_NO_NUMERIC_TRUSTED');
    }
    if (speed.maxSpeedAssessability === 'SHADOW_RAW_ONLY') {
      reasons.push('TRUSTED_MAX_NOT_AVAILABLE');
    }
    return {
      level: 'PARTIAL',
      reasons,
      ...base,
    };
  }
  reasons.push('INSUFFICIENT_TRUSTED_EVIDENCE');
  return {
    level: 'INSUFFICIENT',
    reasons,
    ...base,
  };
}
