import { DI_V0_SPEED_QC_POLICY_V2 } from '../speed-qc/di-v0-speed-qc-policy.version';
import type { DiV0TripSpeedQualityPersistedRow } from './di-v0-trip-speed-quality-projection.repository';
import type { DiV0TripSpeedMaxAssessability } from './di-v0-trip-speed-quality-projection.types';
import {
  DI_V0_TRIP_GPS_SPEED_EVALUATION_PRODUCT_CONTRACT_V1,
  type DiV0TripGpsSpeedEvaluationProductV1,
  type DiV0TripGpsSpeedMaxScope,
} from './di-v0-trip-speed-quality-product-read.types';

function mapMaxScope(assessability: DiV0TripSpeedMaxAssessability): DiV0TripGpsSpeedMaxScope {
  switch (assessability) {
    case 'TRUSTED_MAX_AVAILABLE':
    case 'TRUSTED_LIMITED_ONLY':
      return assessability === 'TRUSTED_LIMITED_ONLY'
        ? 'TRUSTED_LIMITED_ONLY'
        : 'TRUSTED_NUMERIC_INTERVALS';
    default:
      return 'UNAVAILABLE';
  }
}

function resolveProductMaxKmh(
  assessability: DiV0TripSpeedMaxAssessability,
  qcTrustedMaxKmh: number | null,
): number | null {
  if (assessability === 'TRUSTED_MAX_AVAILABLE') return qcTrustedMaxKmh;
  if (assessability === 'TRUSTED_LIMITED_ONLY') return qcTrustedMaxKmh;
  return null;
}

export function toDiV0TripGpsSpeedEvaluationProductV1FromPersistedRow(
  row: DiV0TripSpeedQualityPersistedRow,
): DiV0TripGpsSpeedEvaluationProductV1 {
  const { projection } = row;
  if (projection.identity.qcPolicyVersion !== DI_V0_SPEED_QC_POLICY_V2) {
    throw new Error('Product read refuses non-V2 persisted row');
  }
  const assessabilityLevel = projection.assessability.level;
  const notAssessable =
    assessabilityLevel === 'UNASSESSABLE' || assessabilityLevel === 'INSUFFICIENT';

  const maxAssessability = projection.speed.maxSpeedAssessability;
  const maxScope = mapMaxScope(maxAssessability);

  return {
    contractVersion: DI_V0_TRIP_GPS_SPEED_EVALUATION_PRODUCT_CONTRACT_V1,
    qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
    availability: notAssessable ? 'NOT_ASSESSABLE' : 'READY',
    assessabilityLevel,
    limitedAssessability: assessabilityLevel === 'PARTIAL',
    coverage: {
      totalIntervalCount: projection.quality.totalIntervalCount,
      numericCoveragePercent: projection.quality.numericCoveragePercent,
      trustedNumericCoveragePercent: projection.quality.trustedNumericCoveragePercent,
      trustedLimitedCoveragePercent: projection.quality.trustedLimitedCoveragePercent,
      trustedNumericIntervalCount: projection.quality.trustedNumericCount,
      trustedLimitedStationaryIntervalCount: projection.quality.trustedLimitedStationaryCount,
    },
    speed: {
      maxKmh: resolveProductMaxKmh(maxAssessability, projection.speed.qcTrustedMaxKmh),
      maxScope,
      maxAssessability,
      meanKmh: projection.speed.qcTrustedMeanKmh,
      meanScope: 'TRUSTED_NUMERIC_INTERVALS_ONLY',
    },
    motion: {
      stationarySupportedIntervalCount: projection.motion.stationarySupportedCount,
      movingEstimatedIntervalCount: projection.motion.movingEstimatedCount,
    },
  };
}

export function buildDiV0TripGpsSpeedEvaluationUnavailable(
  availability: 'PENDING' | 'UNAVAILABLE' | 'NOT_ASSESSABLE',
  assessabilityLevel: DiV0TripGpsSpeedEvaluationProductV1['assessabilityLevel'] = null,
): DiV0TripGpsSpeedEvaluationProductV1 {
  return {
    contractVersion: DI_V0_TRIP_GPS_SPEED_EVALUATION_PRODUCT_CONTRACT_V1,
    qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
    availability,
    assessabilityLevel,
    limitedAssessability: false,
    coverage: null,
    speed: null,
    motion: null,
  };
}
