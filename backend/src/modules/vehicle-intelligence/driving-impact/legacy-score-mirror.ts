/**
 * Legacy score mirror contract — Driving Intelligence V2 (Prompt 10).
 *
 * Canonical fields (domain logic MUST read these only):
 * - `TripDrivingImpact.drivingStressScore` + derived `stressLevel`
 * - `RentalDrivingAnalysis.payload.vehicleStressSummary.{drivingStressScore,stressLevel}`
 * - `tripAssessment.*` for conduct / misuse decisions
 * - Aggregates: `avgDrivingStressScore` (never avg from legacy columns)
 *
 * Legacy mirrors (write-only API/DB compat — MUST NOT drive decisions):
 * - `VehicleTrip.drivingScore`
 * - `RentalDrivingAnalysis.drivingScore` column
 * - API aliases: `drivingStyleScore`, `avgDrivingScore`, `avgDrivingStyleScore`
 *
 * No field-deletion migration — mirrors stay populated from canonical writers.
 */

export const LEGACY_SCORE_MIRROR_MAP = {
  drivingScore: 'drivingStressScore',
  drivingStyleScore: 'drivingStressScore',
  avgDrivingScore: 'avgDrivingStressScore',
  avgDrivingStyleScore: 'avgDrivingStressScore',
} as const;

export type LegacyScoreMirrorField = keyof typeof LEGACY_SCORE_MIRROR_MAP;
export type CanonicalStressField =
  (typeof LEGACY_SCORE_MIRROR_MAP)[LegacyScoreMirrorField];

/** Write-path helper: mirror canonical stress onto VehicleTrip.drivingScore. */
export function mirrorVehicleTripDrivingScore(
  drivingStressScore: number | null,
): { drivingScore: number | null } {
  return { drivingScore: drivingStressScore };
}

export type RentalVehicleStressPayload = {
  vehicleStressSummary?: {
    drivingStressScore?: number | null;
    stressLevel?: string | null;
  } | null;
};

/** Canonical stress from rental analysis JSON payload (preferred over DB mirror column). */
export function readCanonicalDrivingStressFromRentalPayload(
  payload: unknown,
): number | null {
  const summary = (payload as RentalVehicleStressPayload | null)?.vehicleStressSummary;
  const score = summary?.drivingStressScore;
  return typeof score === 'number' && !Number.isNaN(score) ? score : null;
}

/** Canonical stress level from rental analysis JSON payload. */
export function readCanonicalStressLevelFromRentalPayload(
  payload: unknown,
): string | null {
  const level = (payload as RentalVehicleStressPayload | null)?.vehicleStressSummary
    ?.stressLevel;
  return typeof level === 'string' && level.length > 0 ? level : null;
}
