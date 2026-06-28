/**
 * SynqDrive — Context signal statistics (pure).
 *
 * Computes per-signal stats, window-level data quality, signal coverage, and base
 * reason codes for a context window. Reuses the repo's `HighFrequencyReading`
 * shape (from `fetchHighFrequency`) — no new query.
 *
 * CADENCE CAVEAT: even though the upstream query asks for `interval:"1s"`, LTE_R1
 * HF is frequently sparse. All stats here derive the EFFECTIVE cadence from the
 * actual sample timestamps; nothing assumes a true 1-second grid.
 *
 * The numeric thresholds below are CONTEXT-LABELING thresholds (coverage quality,
 * cold/high tags) for diagnostics — they are NOT the existing abuse-detector
 * thresholds and do not change any detection.
 */
import type { HighFrequencyReading } from '../../dimo/dimo-segments.service';
import {
  ENGINE_CONTEXT_SIGNALS,
  type ContextReasonCode,
  type ContextWindowDataQuality,
  type EngineContextSignal,
  type SignalCoverage,
  type SignalCoverageQuality,
} from './event-context.types';
import type { ContextSignalStats } from './event-context-assessment.types';

// ── Context-labeling thresholds (NOT detector thresholds) ──────────────────────
export const COVERAGE_GOOD_MIN_SAMPLES = 8;
export const COVERAGE_GOOD_MAX_MEDIAN_INTERVAL_MS = 3_000;
export const SPARSE_CADENCE_MEDIAN_MS = 5_000;
export const COLD_COOLANT_C = 60;
export const HIGH_RPM_ABS = 3_500;
export const HIGH_THROTTLE_PCT = 80;
export const HIGH_ENGINE_LOAD_PCT = 80;
export const STANDSTILL_KMH = 3;

const ACCESSORS: Record<EngineContextSignal, (r: HighFrequencyReading) => number | null> = {
  speed: (r) => r.speedKmh,
  rpm: (r) => r.rpm,
  throttle: (r) => r.throttlePosition,
  engineLoad: (r) => r.engineLoad,
  coolant: (r) => r.engineCoolantTempC,
};

const MISSING_REASON: Record<EngineContextSignal, ContextReasonCode> = {
  speed: 'MISSING_SPEED',
  rpm: 'MISSING_RPM',
  throttle: 'MISSING_THROTTLE',
  engineLoad: 'MISSING_ENGINE_LOAD',
  coolant: 'MISSING_COOLANT',
};

export interface SignalStatsResult {
  perSignal: Record<EngineContextSignal, ContextSignalStats>;
  dataQuality: ContextWindowDataQuality;
  signalCoverage: SignalCoverage[];
  reasonCodes: ContextReasonCode[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function percentile(sortedAsc: number[], p: number): number | null {
  if (!sortedAsc.length) return null;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor(p * (sortedAsc.length - 1))));
  return sortedAsc[idx];
}

function intervalsOf(tsAsc: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < tsAsc.length; i++) out.push(tsAsc[i] - tsAsc[i - 1]);
  return out;
}

function resolveCoverage(
  applicable: boolean,
  nonNullCount: number,
  medianIntervalMs: number | null,
): SignalCoverageQuality {
  if (!applicable) return 'NOT_APPLICABLE';
  if (nonNullCount === 0) return 'MISSING';
  if (
    nonNullCount >= COVERAGE_GOOD_MIN_SAMPLES &&
    medianIntervalMs != null &&
    medianIntervalMs <= COVERAGE_GOOD_MAX_MEDIAN_INTERVAL_MS
  ) {
    return 'GOOD';
  }
  return 'SPARSE';
}

/**
 * Compute per-signal + window-level stats and base reason codes. Pure.
 *
 * @param engineSignalsApplicable false for battery-electric (engine signals are
 *   reported NOT_APPLICABLE rather than MISSING).
 */
export function computeSignalStats(
  readings: HighFrequencyReading[],
  anchorTs: number,
  engineSignalsApplicable: boolean,
): SignalStatsResult {
  const sorted = [...readings].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const allTs = sorted.map((r) => new Date(r.timestamp).getTime());

  const perSignal = {} as Record<EngineContextSignal, ContextSignalStats>;
  const signalCoverage: SignalCoverage[] = [];
  const reasonCodes = new Set<ContextReasonCode>();

  for (const signal of ENGINE_CONTEXT_SIGNALS) {
    const applicable = signal === 'speed' ? true : engineSignalsApplicable;
    const acc = ACCESSORS[signal];
    const pts = sorted
      .map((r) => ({ ts: new Date(r.timestamp).getTime(), v: acc(r) }))
      .filter((p): p is { ts: number; v: number } => p.v != null);
    const values = pts.map((p) => p.v);
    const nonNullCount = pts.length;
    const sortedIv = intervalsOf(pts.map((p) => p.ts)).sort((a, b) => a - b);
    const median = percentile(sortedIv, 0.5);

    let nearestValue: number | null = null;
    let nearestDist: number | null = null;
    let valueBeforeAnchor: number | null = null;
    let valueAfterAnchor: number | null = null;
    for (const p of pts) {
      const d = Math.abs(p.ts - anchorTs);
      if (nearestDist == null || d < nearestDist) {
        nearestDist = d;
        nearestValue = p.v;
      }
      // pts are time-sorted: last sample at/before anchor, first sample at/after.
      if (p.ts <= anchorTs) valueBeforeAnchor = p.v;
      if (p.ts >= anchorTs && valueAfterAnchor == null) valueAfterAnchor = p.v;
    }

    const coverageQuality = resolveCoverage(applicable, nonNullCount, median);
    const allIntervals = intervalsOf(pts.map((p) => p.ts));

    perSignal[signal] = {
      signal,
      count: sorted.length,
      nonNullCount,
      firstValue: values.length ? values[0] : null,
      lastValue: values.length ? values[values.length - 1] : null,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      avg: values.length ? round2(values.reduce((a, b) => a + b, 0) / values.length) : null,
      nearestValueToAnchor: nearestValue,
      nearestSampleDistanceMs: nearestDist,
      valueBeforeAnchor,
      valueAfterAnchor,
      medianIntervalMs: median,
      p95IntervalMs: percentile(sortedIv, 0.95),
      maxGapMs: allIntervals.length ? Math.max(...allIntervals) : null,
      gapsOver2s: allIntervals.filter((x) => x > 2_000).length,
      gapsOver5s: allIntervals.filter((x) => x > 5_000).length,
      gapsOver10s: allIntervals.filter((x) => x > 10_000).length,
      coverageQuality,
    };
    signalCoverage.push({ signal, nonNullCount, quality: coverageQuality });

    if (coverageQuality === 'MISSING') reasonCodes.add(MISSING_REASON[signal]);
    if (!applicable) reasonCodes.add('NOT_APPLICABLE_POWERTRAIN');
  }

  // Window-level data quality (across all readings, by timestamp).
  const winIv = intervalsOf([...allTs].sort((a, b) => a - b));
  const winSortedIv = [...winIv].sort((a, b) => a - b);
  let nearestToAnchor: number | null = null;
  for (const ts of allTs) {
    const d = Math.abs(ts - anchorTs);
    if (nearestToAnchor == null || d < nearestToAnchor) nearestToAnchor = d;
  }
  const medianWin = percentile(winSortedIv, 0.5);

  const dataQuality: ContextWindowDataQuality = {
    sampleCount: sorted.length,
    medianIntervalMs: medianWin,
    p95IntervalMs: percentile(winSortedIv, 0.95),
    maxGapMs: winIv.length ? Math.max(...winIv) : null,
    nearestSampleToAnchorMs: nearestToAnchor,
    coverage: signalCoverage,
  };

  if (medianWin != null && medianWin > SPARSE_CADENCE_MEDIAN_MS) {
    reasonCodes.add('SPARSE_SIGNAL_CADENCE');
  }

  // Engine-context tags from values nearest the anchor.
  const coolantNear = perSignal.coolant.nearestValueToAnchor;
  if (coolantNear != null) {
    reasonCodes.add(coolantNear < COLD_COOLANT_C ? 'COLD_ENGINE' : 'WARM_ENGINE');
  }
  if (perSignal.rpm.max != null && perSignal.rpm.max >= HIGH_RPM_ABS) reasonCodes.add('HIGH_RPM');
  if (perSignal.throttle.max != null && perSignal.throttle.max >= HIGH_THROTTLE_PCT) {
    reasonCodes.add('HIGH_THROTTLE');
  }
  if (perSignal.engineLoad.max != null && perSignal.engineLoad.max >= HIGH_ENGINE_LOAD_PCT) {
    reasonCodes.add('HIGH_ENGINE_LOAD');
  }
  const speedBefore = perSignal.speed.valueBeforeAnchor;
  if (speedBefore != null) {
    reasonCodes.add(speedBefore <= STANDSTILL_KMH ? 'STANDSTILL_BEFORE_EVENT' : 'MOVING_BEFORE_EVENT');
  }

  return { perSignal, dataQuality, signalCoverage, reasonCodes: [...reasonCodes] };
}
