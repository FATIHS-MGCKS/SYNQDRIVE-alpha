/** Canonical REST assessment handoff repair lookback (D2 reconciliation safety net). */
export const CANONICAL_REST_ASSESSMENT_HANDOFF_LOOKBACK_MS = 7 * 24 * 3600_000;

/** Max candidate rows fetched per reconciliation pass (bounds work per invocation). */
export const CANONICAL_REST_ASSESSMENT_HANDOFF_MAX_SCAN_MULTIPLIER = 20;

/**
 * Wall-clock rotation interval for scan-window advancement across invocations.
 * Progress is derived from time — not process memory — so replicas and restarts
 * share the same deterministic offset without a local cursor authority.
 */
export const CANONICAL_REST_ASSESSMENT_HANDOFF_ROTATION_SLOT_MS = 60_000;

/** Number of rotating scan windows cycled per full rotation epoch. */
export const CANONICAL_REST_ASSESSMENT_HANDOFF_ROTATION_SLOTS = 32;

export function maxScannedRestAssessmentHandoffCandidates(batch: number): number {
  return batch * CANONICAL_REST_ASSESSMENT_HANDOFF_MAX_SCAN_MULTIPLIER;
}

/**
 * Deterministic OFFSET for incomplete-candidate queries.
 * Slot advances with wall clock so each bounded invocation covers a different
 * window of the incomplete set without persisting a process-local cursor.
 */
export function resolveRestAssessmentHandoffScanOffset(
  nowMs: number,
  maxScanned: number,
): number {
  if (maxScanned <= 0) {
    return 0;
  }
  const slot =
    Math.floor(nowMs / CANONICAL_REST_ASSESSMENT_HANDOFF_ROTATION_SLOT_MS) %
    CANONICAL_REST_ASSESSMENT_HANDOFF_ROTATION_SLOTS;
  return slot * maxScanned;
}
