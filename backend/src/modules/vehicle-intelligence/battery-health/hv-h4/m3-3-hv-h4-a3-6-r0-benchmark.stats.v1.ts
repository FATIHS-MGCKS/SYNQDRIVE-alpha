export interface M3_3HvH4A3_6R0TimingStatsV1 {
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  samples: number;
}

export function computeTimingStatsV1(samplesMs: number[]): M3_3HvH4A3_6R0TimingStatsV1 {
  if (samplesMs.length === 0) {
    return { p50Ms: 0, p95Ms: 0, maxMs: 0, samples: 0 };
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const pick = (p: number) => {
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
    return sorted[idx]!;
  };
  return {
    p50Ms: pick(0.5),
    p95Ms: pick(0.95),
    maxMs: sorted[sorted.length - 1]!,
    samples: sorted.length,
  };
}

export function formatTimingStatsV1(stats: M3_3HvH4A3_6R0TimingStatsV1): string {
  return `p50=${stats.p50Ms.toFixed(2)}ms p95=${stats.p95Ms.toFixed(2)}ms max=${stats.maxMs.toFixed(2)}ms n=${stats.samples}`;
}
