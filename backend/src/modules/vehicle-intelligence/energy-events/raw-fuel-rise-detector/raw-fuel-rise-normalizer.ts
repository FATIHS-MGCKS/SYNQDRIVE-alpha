import type { RawFuelSignalSample } from './raw-fuel-signal-sample.types';
import type { RawFuelRiseDetectorFailureReason } from './raw-fuel-rise-detector.types';

export interface NormalizedRawFuelSample extends RawFuelSignalSample {
  timestamp: Date;
}

export type NormalizeRawFuelSamplesResult =
  | { ok: true; samples: NormalizedRawFuelSample[] }
  | { ok: false; reason: RawFuelRiseDetectorFailureReason; detail: string };

/**
 * Non-finite numeric channel values (NaN, ±Infinity) are excluded per channel.
 * They are NOT treated as trustworthy absence. See `NON_FINITE_SAMPLE_POLICY`.
 */
export const NON_FINITE_SAMPLE_POLICY =
  'INVALID_CHANNEL_SAMPLE_EXCLUDED_WITH_EXPLICIT_DIAGNOSTIC' as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function valuesEqual(
  a: number | null | undefined,
  b: number | null | undefined,
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a === b;
}

export function normalizeRawFuelSamples(
  samples: RawFuelSignalSample[],
  scanWindowStart: Date,
  scanWindowEnd: Date,
  relativeValidRange: { min: number; max: number },
): NormalizeRawFuelSamplesResult {
  const startMs = scanWindowStart.getTime();
  const endMs = scanWindowEnd.getTime();
  const deduped = new Map<number, NormalizedRawFuelSample>();

  for (const sample of samples) {
    if (!(sample.timestamp instanceof Date) || Number.isNaN(sample.timestamp.getTime())) {
      return { ok: false, reason: 'invalid_sample', detail: 'missing_or_invalid_timestamp' };
    }
    const ts = sample.timestamp.getTime();
    if (ts < startMs || ts > endMs) continue;

    const absoluteLiters = isFiniteNumber(sample.absoluteLiters) ? sample.absoluteLiters : null;
    const relativePercent = isFiniteNumber(sample.relativePercent)
      ? sample.relativePercent
      : null;

    if (absoluteLiters != null && absoluteLiters < 0) {
      return { ok: false, reason: 'invalid_sample', detail: 'negative_absolute_liters' };
    }
    if (relativePercent != null) {
      if (
        relativePercent < relativeValidRange.min ||
        relativePercent > relativeValidRange.max
      ) {
        return { ok: false, reason: 'invalid_sample', detail: 'relative_percent_out_of_range' };
      }
    }
    if (absoluteLiters == null && relativePercent == null) continue;

    const existing = deduped.get(ts);
    if (existing) {
      if (
        !valuesEqual(existing.absoluteLiters, absoluteLiters) ||
        !valuesEqual(existing.relativePercent, relativePercent)
      ) {
        return {
          ok: false,
          reason: 'conflicting_duplicate_timestamp',
          detail: `conflict_at_${sample.timestamp.toISOString()}`,
        };
      }
      continue;
    }

    deduped.set(ts, {
      timestamp: sample.timestamp,
      absoluteLiters,
      relativePercent,
    });
  }

  return {
    ok: true,
    samples: [...deduped.values()].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    ),
  };
}

export function extractChannelSeries(
  samples: NormalizedRawFuelSample[],
  channel: 'ABSOLUTE_LITERS' | 'RELATIVE_PERCENT',
): Array<{ timestamp: Date; value: number; source: NormalizedRawFuelSample }> {
  const series: Array<{ timestamp: Date; value: number; source: NormalizedRawFuelSample }> =
    [];
  for (const sample of samples) {
    if (channel === 'ABSOLUTE_LITERS') {
      if (isFiniteNumber(sample.absoluteLiters)) {
        series.push({ timestamp: sample.timestamp, value: sample.absoluteLiters, source: sample });
      }
      continue;
    }
    if (isFiniteNumber(sample.relativePercent)) {
      series.push({
        timestamp: sample.timestamp,
        value: sample.relativePercent,
        source: sample,
      });
    }
  }
  return series;
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function withinTolerance(
  value: number,
  center: number,
  tolerance: number,
): boolean {
  return Math.abs(value - center) <= tolerance;
}

export function maxGapSeconds(
  points: Array<{ timestamp: Date }>,
): number {
  if (points.length < 2) return 0;
  let maxGap = 0;
  for (let i = 1; i < points.length; i++) {
    const gap = (points[i].timestamp.getTime() - points[i - 1].timestamp.getTime()) / 1000;
    if (gap > maxGap) maxGap = gap;
  }
  return Math.round(maxGap);
}
