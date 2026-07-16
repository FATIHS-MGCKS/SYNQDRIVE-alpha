import type { DrivingImpactHealthEligibility } from '../driving-impact/driving-impact-provenance';
import type { DrivingImpactModelProfileId } from '../driving-impact-model-profile/driving-impact-model-profile.types';

export const DRIVING_IMPACT_ROLLING_VERSION = 'impact-rolling-v1';

export type RollingMixPolicy =
  | 'COMPATIBLE_COHORT'
  | 'MODEL_CHANGE_RESET'
  | 'PROFILE_PARTITION';

export type RollingExclusionReason =
  | 'MODEL_VERSION_MISMATCH'
  | 'MODEL_PROFILE_VERSION_MISMATCH'
  | 'PROFILE_INCOMPATIBLE'
  | 'UNSCORED_TRIP';

export type DrivingImpactRollingSourceQuality = {
  measuredShare: number;
  providerClassifiedShare: number;
  reconstructedShare: number;
  estimatedProxyShare: number;
  contextOnlyShare: number;
  measurementCoverage: number | null;
};

export type DrivingImpactRollingProxyShare = {
  estimatedProxyShare: number;
  brakingProxyKinematicShare: number;
};

export type DrivingImpactRollingWindowManifest = {
  version: typeof DRIVING_IMPACT_ROLLING_VERSION;
  windowDays: number;
  windowStartedAt: string | null;
  windowEndedAt: string | null;
  tripCount: number;
  scoredTripCount: number;
  excludedTripCount: number;
  distanceKmWindow: number;
  excludedDistanceKm: number;
  modelVersion: string;
  modelProfileVersion: string | null;
  modelProfile: DrivingImpactModelProfileId | null;
  mixPolicy: RollingMixPolicy;
  exclusionSummary: Partial<Record<RollingExclusionReason, number>>;
  sourceQuality: DrivingImpactRollingSourceQuality;
  proxyShare: DrivingImpactRollingProxyShare;
  /** Separate from mechanical stress scores — health modules only. */
  healthEligibility: DrivingImpactHealthEligibility;
  notDriverEvaluation: true;
  comparabilityHint: string | null;
  recomputeDeterministic: true;
};

export type TripRollingIdentity = {
  tripId: string;
  modelVersion: string;
  modelProfileVersion: string | null;
  modelProfile: DrivingImpactModelProfileId | null;
  behavioralIngestionPath: string | null;
};

export type RollingTripRow = {
  tripId: string;
  distanceKm: number;
  tripStartedAt: Date;
  tripEndedAt: Date | null;
  drivingStressScore: number | null;
  modelVersion: string;
  sourceSummaryJson: unknown;
};
