export function wilsonScoreInterval(
  successes: number,
  trials: number,
  z = 1.96,
): { lower: number; upper: number } | null {
  if (trials <= 0 || successes < 0 || successes > trials) return null;
  const p = successes / trials;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials)) / denom;
  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[idx];
}

export function medianP25P75(values: number[]): {
  median: number | null;
  p25: number | null;
  p75: number | null;
} {
  if (values.length === 0) {
    return { median: null, p25: null, p75: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median: percentile(sorted, 0.5),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
  };
}

export function minMax(values: number[]): { min: number | null; max: number | null } {
  if (values.length === 0) return { min: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  return { min: sorted[0], max: sorted[sorted.length - 1] };
}
