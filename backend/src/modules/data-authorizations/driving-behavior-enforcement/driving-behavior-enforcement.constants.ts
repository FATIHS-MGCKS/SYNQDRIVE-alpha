import { AUTHORIZATION_DECISION_ACTION } from '../authorization-decision-engine/authorization-decision.constants';

export const DRIVING_BEHAVIOR_ACTION = {
  DERIVE: AUTHORIZATION_DECISION_ACTION.DERIVE,
  PROFILE: AUTHORIZATION_DECISION_ACTION.PROFILE,
  READ: AUTHORIZATION_DECISION_ACTION.READ,
  EXPORT: AUTHORIZATION_DECISION_ACTION.EXPORT,
  USE_FOR_AI: AUTHORIZATION_DECISION_ACTION.USE_FOR_AI,
  NOTIFY: AUTHORIZATION_DECISION_ACTION.NOTIFY,
} as const;

export const DRIVING_BEHAVIOR_DATA_CATEGORY = {
  DRIVING_BEHAVIOR: 'DRIVING_BEHAVIOR',
} as const;

/** Explicit purposes — profiling never implied by general telemetry policies. */
export const DRIVING_BEHAVIOR_PURPOSE = {
  /** Technical event detection (harsh accel/brake, cornering, launch, impact). */
  TECHNICAL_EVENT_DETECTION: 'TECHNICAL_OVERVIEW',
  /** Route/safety analysis (speeding, route enrich). */
  SAFETY_ANALYSIS: 'TECHNICAL_OVERVIEW',
  /** Fleet operations / vehicle stress (not driver quality). */
  FLEET_OPERATIONS: 'FLEET_ANALYTICS',
  /** Driver profiling / aggregated driver scores. */
  DRIVER_PROFILING: 'RENTAL_ANALYTICS',
  /** Misuse aggregation, abuse detection. */
  MISUSE_DETECTION: 'ABUSE_MISUSE_DETECTION',
  /** Automated trip assessment / Fahrbewertung. */
  AUTOMATED_ASSESSMENT: 'RENTAL_ANALYTICS',
  /** Damage suspicion / possible impact escalation. */
  DAMAGE_SUSPECT: 'ABUSE_MISUSE_DETECTION',
  /** Booking-level risk assessment. */
  BOOKING_RISK: 'RENTAL_ANALYTICS',
} as const;

export const DRIVING_BEHAVIOR_PROFILING_PURPOSES = new Set<string>([
  DRIVING_BEHAVIOR_PURPOSE.DRIVER_PROFILING,
  DRIVING_BEHAVIOR_PURPOSE.MISUSE_DETECTION,
  DRIVING_BEHAVIOR_PURPOSE.AUTOMATED_ASSESSMENT,
  DRIVING_BEHAVIOR_PURPOSE.DAMAGE_SUSPECT,
  DRIVING_BEHAVIOR_PURPOSE.BOOKING_RISK,
]);

export const DRIVING_BEHAVIOR_DERIVE_PURPOSES = new Set<string>([
  DRIVING_BEHAVIOR_PURPOSE.TECHNICAL_EVENT_DETECTION,
  DRIVING_BEHAVIOR_PURPOSE.SAFETY_ANALYSIS,
  DRIVING_BEHAVIOR_PURPOSE.FLEET_OPERATIONS,
]);

export const DRIVING_BEHAVIOR_PATH = {
  BEHAVIOR_EVENT_DERIVE: 'behavior-event-derive',
  HARSH_ACCEL_DERIVE: 'harsh-acceleration-derive',
  HARSH_BRAKE_DERIVE: 'harsh-braking-derive',
  CORNERING_DERIVE: 'cornering-derive',
  LAUNCH_DERIVE: 'launch-like-derive',
  IMPACT_DERIVE: 'possible-impact-derive',
  FULL_BRAKING_DERIVE: 'full-braking-derive',
  DRIVING_IMPACT_DERIVE: 'driving-impact-derive',
  SAFETY_ROUTE_DERIVE: 'safety-route-derive',
  MISUSE_AGGREGATE: 'misuse-aggregate',
  DRIVER_SCORE_AGGREGATE: 'driver-score-aggregate',
  TRIP_ASSESSMENT: 'trip-assessment',
  TRIP_DECISION_SUMMARY: 'trip-decision-summary',
  BOOKING_RISK: 'booking-risk-assessment',
  BEHAVIOR_READ: 'behavior-read',
  DRIVER_SCORE_READ: 'driver-score-read',
  BEHAVIOR_EXPORT: 'behavior-export',
  BEHAVIOR_AI: 'behavior-ai',
  BEHAVIOR_NOTIFY: 'behavior-notify',
  BEHAVIOR_REPROCESS: 'behavior-reprocess',
  BEHAVIOR_BACKFILL: 'behavior-backfill',
} as const;

export const DRIVING_BEHAVIOR_SERVICE_IDENTITY = {
  BEHAVIOR_ENRICH_WORKER: 'synqdrive-behavior-enrich-worker',
  DRIVING_IMPACT_WORKER: 'synqdrive-driving-impact-worker',
  MISUSE_RECONCILE: 'synqdrive-misuse-reconcile',
  DRIVER_SCORE_API: 'synqdrive-driver-score-api',
  TRIP_DECISION_API: 'synqdrive-trip-decision-api',
  TRIP_ASSESSMENT_WORKER: 'synqdrive-trip-assessment-worker',
  BOOKING_RISK_WORKER: 'synqdrive-booking-risk-worker',
  BEHAVIOR_READ_API: 'synqdrive-behavior-read-api',
  BEHAVIOR_EXPORT_API: 'synqdrive-behavior-export-api',
  BEHAVIOR_AI: 'synqdrive-behavior-ai',
  BEHAVIOR_NOTIFY: 'synqdrive-behavior-notify',
} as const;
