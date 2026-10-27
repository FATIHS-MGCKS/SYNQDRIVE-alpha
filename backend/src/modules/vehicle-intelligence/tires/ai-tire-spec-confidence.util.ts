/**
 * Tire AI confidence score contract: 0–100 (integer-ish percent).
 * Legacy LLM outputs may use 0–1 fractions.
 */

function toFiniteNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize confidence to 0–100 for persistence and evidence consumers.
 *
 * Rules:
 * - (0, 1) fractional values → multiply by 100 (legacy 0–1 scale).
 * - 1 is treated as **1 percent**, not 100%, to avoid silent high-confidence promotion.
 * - 1 < n ≤ 100 → use as percent on 0–100 scale.
 * - n > 100 or n < 0 → rejected (null).
 */
export function normalizeTireSpecConfidenceScore(raw: unknown): number | null {
  const n = toFiniteNumberOrNull(raw);
  if (n == null) return null;
  if (n < 0 || n > 100) return null;
  if (n > 0 && n < 1) {
    return Math.round(n * 100);
  }
  return n;
}
