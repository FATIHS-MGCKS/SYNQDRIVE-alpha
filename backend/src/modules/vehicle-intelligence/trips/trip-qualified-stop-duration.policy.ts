/**
 * Qualified Stop Contract V1 — pure duration policy (integer milliseconds).
 *
 * Applies only after a stop/gap has passed physical qualification gates elsewhere.
 * Comparator: durationMs <= max → SAME_TRIP; durationMs > max → SPLIT.
 */
export const CANONICAL_MAX_SAME_TRIP_QUALIFIED_STOP_MS = 300_000;

export const QUALIFIED_STOP_DURATION_COMPARATOR = 'LTE_SAME_GT_SPLIT' as const;

export type QualifiedStopDurationPolicyDecision = 'SAME_TRIP' | 'SPLIT';

export function isSameTripQualifiedStop(
  durationMs: number,
  maxSameTripStopMs: number = CANONICAL_MAX_SAME_TRIP_QUALIFIED_STOP_MS,
): boolean {
  return durationMs <= maxSameTripStopMs;
}

export function shouldSplitQualifiedStop(
  durationMs: number,
  maxSameTripStopMs: number = CANONICAL_MAX_SAME_TRIP_QUALIFIED_STOP_MS,
): boolean {
  return durationMs > maxSameTripStopMs;
}

export function shouldMergePreviousTripQualifiedGap(
  gapMs: number,
  maxSameTripStopMs: number = CANONICAL_MAX_SAME_TRIP_QUALIFIED_STOP_MS,
): boolean {
  return gapMs >= 0 && isSameTripQualifiedStop(gapMs, maxSameTripStopMs);
}

export function classifyQualifiedStopDurationPolicy(
  durationMs: number,
  maxSameTripStopMs: number = CANONICAL_MAX_SAME_TRIP_QUALIFIED_STOP_MS,
): QualifiedStopDurationPolicyDecision {
  return isSameTripQualifiedStop(durationMs, maxSameTripStopMs)
    ? 'SAME_TRIP'
    : 'SPLIT';
}

export function buildQualifiedStopDurationDecisionForensics(params: {
  qualifiedStopDurationMs: number;
  maxSameTripStopMs: number;
  qualificationReason?: string;
}): Record<string, unknown> {
  return {
    qualifiedStopDurationMs: params.qualifiedStopDurationMs,
    maxSameTripStopMs: params.maxSameTripStopMs,
    durationPolicyDecision: classifyQualifiedStopDurationPolicy(
      params.qualifiedStopDurationMs,
      params.maxSameTripStopMs,
    ),
    durationComparator: QUALIFIED_STOP_DURATION_COMPARATOR,
    ...(params.qualificationReason
      ? { qualificationReason: params.qualificationReason }
      : {}),
  };
}
