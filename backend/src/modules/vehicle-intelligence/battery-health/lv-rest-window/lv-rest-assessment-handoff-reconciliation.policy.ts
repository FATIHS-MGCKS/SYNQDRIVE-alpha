/** Canonical REST assessment handoff repair lookback (D2 reconciliation safety net). */
export const CANONICAL_REST_ASSESSMENT_HANDOFF_LOOKBACK_MS = 7 * 24 * 3600_000;

/** Max candidate rows inspected per reconciliation pass (bounds work per invocation). */
export const CANONICAL_REST_ASSESSMENT_HANDOFF_MAX_SCAN_MULTIPLIER = 20;

export function maxScannedRestAssessmentHandoffCandidates(batch: number): number {
  return batch * CANONICAL_REST_ASSESSMENT_HANDOFF_MAX_SCAN_MULTIPLIER;
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
