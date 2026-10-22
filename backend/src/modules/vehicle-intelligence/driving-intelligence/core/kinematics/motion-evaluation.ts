import type { MotionCoreSpeedSample } from './speed-sample.types';

export interface SpeedMetricSummary {
  n: number;
  mae: number | null;
  bias: number | null;
  p90Abs: number | null;
  p50Abs: number | null;
}

export function speedMetrics(pairs: Array<{ referenceKmh: number; estimateKmh: number }>): SpeedMetricSummary {
  if (pairs.length === 0) {
    return { n: 0, mae: null, bias: null, p90Abs: null, p50Abs: null };
  }
  const abs = pairs.map((p) => Math.abs(p.estimateKmh - p.referenceKmh)).sort((a, b) => a - b);
  const signed = pairs.map((p) => p.estimateKmh - p.referenceKmh);
  const i90 = Math.min(abs.length - 1, Math.max(0, Math.ceil(0.9 * abs.length) - 1));
  return {
    n: pairs.length,
    mae: round3(abs.reduce((a, b) => a + b, 0) / abs.length),
    bias: round3(signed.reduce((a, b) => a + b, 0) / signed.length),
    p90Abs: round3(abs[i90]!),
    p50Abs: round3(abs[Math.floor(abs.length / 2)]!),
  };
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

export function sampleByLabel(samples: MotionCoreSpeedSample[]): Map<string, MotionCoreSpeedSample> {
  return new Map(samples.map((s) => [s.label, s]));
}

export function commonSupportMetrics(
  baseline: MotionCoreSpeedSample[],
  candidate: MotionCoreSpeedSample[],
  referenceByLabel: Map<string, number>,
): SpeedMetricSummary {
  const b = sampleByLabel(baseline);
  const c = sampleByLabel(candidate);
  const pairs: Array<{ referenceKmh: number; estimateKmh: number }> = [];
  for (const [lab, ref] of referenceByLabel) {
    const bv = b.get(lab)?.valueKmh;
    const cv = c.get(lab)?.valueKmh;
    if (bv != null && cv != null) {
      pairs.push({ referenceKmh: ref, estimateKmh: cv });
    }
  }
  return speedMetrics(pairs);
}

export interface BaselineExactnessReport {
  comparedPairs: number;
  mismatchesAboveTolerance: number;
  toleranceKmh: number;
  maxAbsDeltaKmh: number;
  exactEqualCount: number;
  nullAvailabilityMismatches: number;
  labelAlignmentMismatches: number;
}

export function analyzeBaselineL3Exactness(
  replay: Array<{ bucketLabelUtc: string; l3SpeedKmh: number | null }>,
  shadowByLabel: Map<string, number | null | undefined>,
  toleranceKmh = 0.05,
): BaselineExactnessReport {
  let maxAbs = 0;
  let exactEqual = 0;
  let mism = 0;
  let nullMismatch = 0;
  let compared = 0;
  for (const row of replay) {
    const shadow = shadowByLabel.get(row.bucketLabelUtc);
    if (shadow == null && row.l3SpeedKmh == null) {
      continue;
    }
    if (shadow == null || row.l3SpeedKmh == null) {
      nullMismatch += 1;
      continue;
    }
    compared += 1;
    const d = Math.abs(row.l3SpeedKmh - shadow);
    maxAbs = Math.max(maxAbs, d);
    if (d === 0) {
      exactEqual += 1;
    }
    if (d > toleranceKmh) {
      mism += 1;
    }
  }
  return {
    comparedPairs: compared,
    mismatchesAboveTolerance: mism,
    toleranceKmh,
    maxAbsDeltaKmh: maxAbs,
    exactEqualCount: exactEqual,
    nullAvailabilityMismatches: nullMismatch,
    labelAlignmentMismatches: 0,
  };
}
