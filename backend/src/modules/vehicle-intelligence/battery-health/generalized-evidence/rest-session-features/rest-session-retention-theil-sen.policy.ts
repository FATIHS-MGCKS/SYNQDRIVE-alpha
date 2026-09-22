import type { RestSessionRetentionEligiblePoint } from './rest-session-retention.types';

const MS_PER_HOUR = 3_600_000;

/**
 * Theil-Sen median pairwise slope in mV/hour.
 * Requires >=2 points with distinct ages (zero-time pairs skipped).
 */
export function computeTheilSenRestSlopeMvPerHour(
  points: RestSessionRetentionEligiblePoint[],
): number | null {
  if (points.length < 2) return null;

  const slopes: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const ageDeltaMs = points[j].actualRestAgeMs - points[i].actualRestAgeMs;
      if (ageDeltaMs <= 0) continue;
      const slope =
        (points[j].voltageMv - points[i].voltageMv) / (ageDeltaMs / MS_PER_HOUR);
      if (!Number.isFinite(slope)) continue;
      slopes.push(slope);
    }
  }

  if (slopes.length === 0) return null;

  slopes.sort((a, b) => a - b);
  const mid = Math.floor(slopes.length / 2);
  if (slopes.length % 2 === 1) {
    return slopes[mid];
  }
  return (slopes[mid - 1] + slopes[mid]) / 2;
}

export function deterministicMedianInt(values: number[]): number {
  if (values.length === 0) {
    throw new Error('median requires at least one value');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function populationVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
}
