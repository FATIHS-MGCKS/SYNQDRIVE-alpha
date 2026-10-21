/**
 * Bounded exponential backoff for empty-core / UNKNOWN episodes (TDL-DEC-R11-001).
 */
export function computeEmptyCoreBackoffMs(params: {
  baseIntervalMs: number;
  consecutiveDeferrals: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  /** Fraction of delay used as symmetric jitter, e.g. 0.15 → ±15%. */
  jitterRatio: number;
  /** Optional deterministic seed for tests (0–1). When omitted, uses Math.random(). */
  jitterSeed?: number;
}): number {
  const {
    baseIntervalMs,
    consecutiveDeferrals,
    backoffBaseMs,
    backoffMaxMs,
    jitterRatio,
    jitterSeed,
  } = params;

  if (consecutiveDeferrals <= 0) {
    return applyJitter(baseIntervalMs, jitterRatio, jitterSeed);
  }

  const exponent = Math.min(consecutiveDeferrals, 10);
  const scaled = Math.min(
    backoffMaxMs,
    Math.max(baseIntervalMs, backoffBaseMs * 2 ** (exponent - 1)),
  );
  return applyJitter(scaled, jitterRatio, jitterSeed);
}

function applyJitter(
  delayMs: number,
  jitterRatio: number,
  jitterSeed?: number,
): number {
  if (jitterRatio <= 0) return delayMs;
  const r = jitterSeed ?? Math.random();
  const spread = delayMs * jitterRatio;
  const offset = (r * 2 - 1) * spread;
  return Math.max(1_000, Math.round(delayMs + offset));
}
