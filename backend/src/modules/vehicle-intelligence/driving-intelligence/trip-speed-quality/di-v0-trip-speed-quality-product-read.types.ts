import type { DI_V0_SPEED_QC_POLICY_V2 } from '../speed-qc/di-v0-speed-qc-policy.version';
import type {
  DiV0TripSpeedQualityAssessability,
  DiV0TripSpeedMaxAssessability,
} from './di-v0-trip-speed-quality-projection.types';

export const DI_V0_TRIP_GPS_SPEED_EVALUATION_PRODUCT_CONTRACT_V1 =
  'DI_V0_TRIP_GPS_SPEED_EVALUATION_PRODUCT_V1' as const;

export type DiV0TripGpsSpeedEvaluationAvailability =
  | 'READY'
  | 'PENDING'
  | 'UNAVAILABLE'
  | 'NOT_ASSESSABLE';

export type DiV0TripGpsSpeedEvaluationUnavailableAvailability = Exclude<
  DiV0TripGpsSpeedEvaluationAvailability,
  'READY'
>;

export type DiV0TripGpsSpeedMaxScope =
  | 'TRUSTED_NUMERIC_INTERVALS'
  | 'TRUSTED_LIMITED_ONLY'
  | 'UNAVAILABLE';

export type DiV0TripGpsSpeedMeanScope = 'TRUSTED_NUMERIC_INTERVALS_ONLY';

export interface DiV0TripGpsSpeedEvaluationCoverageV1 {
  totalIntervalCount: number;
  numericCoveragePercent: number | null;
  trustedNumericCoveragePercent: number | null;
  trustedLimitedCoveragePercent: number | null;
  trustedNumericIntervalCount: number;
  trustedLimitedStationaryIntervalCount: number;
}

export interface DiV0TripGpsSpeedEvaluationSpeedV1 {
  maxKmh: number | null;
  maxScope: DiV0TripGpsSpeedMaxScope;
  maxAssessability: DiV0TripSpeedMaxAssessability;
  meanKmh: number | null;
  meanScope: DiV0TripGpsSpeedMeanScope;
}

export interface DiV0TripGpsSpeedEvaluationMotionV1 {
  stationarySupportedIntervalCount: number;
  movingEstimatedIntervalCount: number;
}

/** Customer trip-detail read contract — no ops ids, hashes, or raw worker errors. */
export interface DiV0TripGpsSpeedEvaluationProductV1 {
  contractVersion: typeof DI_V0_TRIP_GPS_SPEED_EVALUATION_PRODUCT_CONTRACT_V1;
  qcPolicyVersion: typeof DI_V0_SPEED_QC_POLICY_V2;
  availability: DiV0TripGpsSpeedEvaluationAvailability;
  assessabilityLevel: DiV0TripSpeedQualityAssessability | null;
  limitedAssessability: boolean;
  coverage: DiV0TripGpsSpeedEvaluationCoverageV1 | null;
  speed: DiV0TripGpsSpeedEvaluationSpeedV1 | null;
  motion: DiV0TripGpsSpeedEvaluationMotionV1 | null;
}
