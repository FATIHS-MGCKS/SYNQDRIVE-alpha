import { MisuseCaseType, MisuseEvidenceSourceType } from '@prisma/client';

/** Rating reconciliation contract version — bump when rules change (P50). */
export const MISUSE_RATING_RECONCILIATION_VERSION = 'misuse-rating-reconciliation-v1';

/** Source strength rank for qualified evidence (higher = stronger). */
export const SOURCE_STRENGTH_RANK: Record<MisuseEvidenceSourceType, number> = {
  MANUAL_VERIFICATION: 5,
  DIMO_EVENT: 4,
  DRIVING_EVENT: 3,
  TRIP_BEHAVIOR_EVENT: 3,
  EVENT_CONTEXT_ASSESSMENT: 2,
  DTC: 2,
  DERIVED_PATTERN: 1,
  VEHICLE_TRIP_COUNTER: 0,
  VEHICLE_LATEST_STATE: 0,
  RPM_WEBHOOK_CANDIDATE: 0,
};

export const HIGH_VALUE_COLLISION_TYPES = new Set<MisuseCaseType>([
  MisuseCaseType.DIMO_COLLISION_REPORTED,
  MisuseCaseType.POSSIBLE_COLLISION_OR_IMPACT,
]);

export const COLLISION_EVENT_TYPES = new Set<string>([
  'safety.collision',
  'POSSIBLE_IMPACT',
  'COLLISION',
  'DIMO_COLLISION',
]);

export const PROVIDER_COLLISION_SOURCES = new Set<MisuseEvidenceSourceType>([
  MisuseEvidenceSourceType.DIMO_EVENT,
  MisuseEvidenceSourceType.DRIVING_EVENT,
  MisuseEvidenceSourceType.MANUAL_VERIFICATION,
]);

/** Cluster thresholds for severity normalization. */
export const CLUSTER_SEVERE_THRESHOLD = 3;
export const CLUSTER_WARNING_THRESHOLD = 1;
