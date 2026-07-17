/** Deterministic recompute trigger reasons (P60). */
export const RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS = {
  TRIP_COMPLETED: 'TRIP_COMPLETED',
  TRIP_ANALYSIS_COMPLETED: 'TRIP_ANALYSIS_COMPLETED',
  ATTRIBUTION_CHANGED: 'ATTRIBUTION_CHANGED',
  MISUSE_RECONCILED: 'MISUSE_RECONCILED',
  MODEL_VERSION_CHANGED: 'MODEL_VERSION_CHANGED',
  BOOKING_ASSIGNMENT_CORRECTED: 'BOOKING_ASSIGNMENT_CORRECTED',
  BOOKING_COMPLETED: 'BOOKING_COMPLETED',
  INPUT_OR_MODEL_CHANGED: 'INPUT_OR_MODEL_CHANGED',
} as const;

export type RentalDrivingAnalysisRecomputeReason =
  (typeof RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS)[keyof typeof RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS];

export type RentalDrivingAnalysisRecomputeResult =
  | { status: 'skipped'; reason: string; analysis?: unknown }
  | { status: 'idempotent'; analysis: unknown }
  | { status: 'created'; analysis: unknown; supersededAnalysisId: string | null }
  | { status: 'in_progress'; reason: string };
