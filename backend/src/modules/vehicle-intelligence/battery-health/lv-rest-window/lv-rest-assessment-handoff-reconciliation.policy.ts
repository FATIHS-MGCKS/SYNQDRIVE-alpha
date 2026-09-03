/** Canonical REST assessment handoff repair lookback (D2 reconciliation safety net). */
export const CANONICAL_REST_ASSESSMENT_HANDOFF_LOOKBACK_MS = 7 * 24 * 3600_000;

/** Max candidate rows inspected per reconciliation pass (bounds work per invocation). */
export const CANONICAL_REST_ASSESSMENT_HANDOFF_MAX_SCAN_MULTIPLIER = 20;

/** DLQ error codes eligible for reconciliation replay (mirrors REST-target recovery). */
export const REPLAYABLE_ASSESSMENT_HANDOFF_DEAD_LETTER_CODES = [
  'LOCK_CONTENTION',
  'TRANSIENT_INFRA',
  'PROVIDER_UNAVAILABLE',
] as const;

export { isLegacyAssessPersistence54000DeadLetter } from '../jobs/battery-v2-job-dead-letter.policy';
export { isLegacyPersistence54000HandoffFailure } from './lv-rest-assessment-handoff-failure.policy';

export function maxScannedRestAssessmentHandoffCandidates(batch: number): number {
  return batch * CANONICAL_REST_ASSESSMENT_HANDOFF_MAX_SCAN_MULTIPLIER;
}

/**
 * At most one canonical assessment-handoff repair enqueue per vehicle per reconciliation pass.
 * Prevents same-vehicle assess-lock fan-out when a vehicle has many historical REST measurements.
 */
export function shouldDeferRestAssessmentHandoffVehicleRepair(
  vehicleId: string,
  repairedVehiclesThisPass: ReadonlySet<string>,
): boolean {
  return repairedVehiclesThisPass.has(vehicleId);
}

/** Mark vehicle as dispatch-touched for this reconciliation pass (enqueue OR guarded skip). */
export function markRestAssessmentHandoffVehicleTouchedThisPass(
  vehicleId: string,
  repairedVehiclesThisPass: Set<string>,
): void {
  repairedVehiclesThisPass.add(vehicleId);
}

/**
 * Deterministic fairness ordering mirrored by reconciliation SQL:
 * never-inspected (NULL lastAttemptAt) first, then oldest attempt, then id.
 */
export function compareRestAssessmentHandoffReconcileFairness(
  a: { id: string; lastAttemptAt: string | null | undefined },
  b: { id: string; lastAttemptAt: string | null | undefined },
): number {
  const aAttempt = a.lastAttemptAt ?? null;
  const bAttempt = b.lastAttemptAt ?? null;
  if (aAttempt === null && bAttempt !== null) return -1;
  if (aAttempt !== null && bAttempt === null) return 1;
  if (aAttempt !== null && bAttempt !== null && aAttempt !== bAttempt) {
    return aAttempt.localeCompare(bAttempt);
  }
  return a.id.localeCompare(b.id);
}
