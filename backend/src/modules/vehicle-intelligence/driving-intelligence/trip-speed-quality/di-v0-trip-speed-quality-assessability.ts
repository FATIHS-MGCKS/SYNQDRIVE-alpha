import type {
  DiV0TripSpeedQualityAssessability,
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
  const reasons: string[] = [];
  if (!snapshotVerified) {
    reasons.push('SNAPSHOT_NOT_VERIFIED');
    return {
      level: 'UNASSESSABLE',
      reasons,
      provisionalCalibration: true,
      customerClaimAuthorized: false,
    };
  }
  if (quality.numericSpeedCount === 0) {
    reasons.push('NO_NUMERIC_SPEED_INTERVALS');
    return {
      level: 'UNASSESSABLE',
      reasons,
      provisionalCalibration: true,
      customerClaimAuthorized: false,
    };
  }
  const coverage = quality.trustedCoveragePercent ?? 0;
  if (quality.trustedNumericCount === 0 && quality.trustedLimitedCount === 0) {
    reasons.push('NO_TRUSTED_OR_LIMITED_INTERVALS');
    return {
      level: 'INSUFFICIENT',
      reasons,
      provisionalCalibration: true,
      customerClaimAuthorized: false,
    };
  }
  if (coverage >= 70 && quality.trustedNumericCount > 0) {
    reasons.push('TRUSTED_COVERAGE_HIGH');
    return {
      level: 'FULL',
      reasons,
      provisionalCalibration: true,
      customerClaimAuthorized: false,
    };
  }
  if (quality.trustedNumericCount > 0 || quality.trustedLimitedCount > 0) {
    reasons.push('TRUSTED_COVERAGE_PARTIAL');
    if (speed.maxSpeedAssessability === 'SHADOW_RAW_ONLY') {
      reasons.push('TRUSTED_MAX_NOT_AVAILABLE');
    }
    return {
      level: 'PARTIAL',
      reasons,
      provisionalCalibration: true,
      customerClaimAuthorized: false,
    };
  }
  reasons.push('INSUFFICIENT_TRUSTED_EVIDENCE');
  return {
    level: 'INSUFFICIENT',
    reasons,
    provisionalCalibration: true,
    customerClaimAuthorized: false,
  };
}
