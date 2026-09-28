/**
 * Deterministic descriptive statistics for F5 calibration reports.
 * Percentile method: linear interpolation between closest ranks (NumPy default, type R7).
 */

export type F5NumericStatsV1 = {
  count: number;
  nullCount: number;
  min: number | null;
  p10: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  p90: number | null;
  max: number | null;
  mad: number | null;
};

function finiteNumbers(values: Array<number | null | undefined>): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (v === null || v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    out.push(v);
  }
  return out;
}

/** Linear interpolation percentile on sorted finite values (inclusive 0..1). */
export function percentileLinear(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0]!;
  const clamped = Math.min(1, Math.max(0, p));
  const idx = clamped * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo]!;
  const weight = idx - lo;
  return sortedAsc[lo]! * (1 - weight) + sortedAsc[hi]! * weight;
}

export function medianAbsoluteDeviation(sortedAsc: number[]): number | null {
  if (sortedAsc.length === 0) return null;
  const med = percentileLinear(sortedAsc, 0.5);
  if (med === null) return null;
  const deviations = sortedAsc.map((x) => Math.abs(x - med)).sort((a, b) => a - b);
  return percentileLinear(deviations, 0.5);
}

export function computeNumericStats(values: Array<number | null | undefined>): F5NumericStatsV1 {
  const nullCount = values.filter((v) => v === null || v === undefined).length;
  const nums = finiteNumbers(values);
  const sorted = [...nums].sort((a, b) => a - b);
  return {
    count: nums.length,
    nullCount,
    min: sorted[0] ?? null,
    p10: percentileLinear(sorted, 0.1),
    p25: percentileLinear(sorted, 0.25),
    median: percentileLinear(sorted, 0.5),
    p75: percentileLinear(sorted, 0.75),
    p90: percentileLinear(sorted, 0.9),
    max: sorted[sorted.length - 1] ?? null,
    mad: medianAbsoluteDeviation(sorted),
  };
}
