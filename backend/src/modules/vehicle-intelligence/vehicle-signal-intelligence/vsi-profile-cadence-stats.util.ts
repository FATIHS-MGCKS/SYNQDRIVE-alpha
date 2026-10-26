import { createHash } from 'node:crypto';
import type { VsiSignalConfidenceLevel } from './vsi-profile.types';
import {
  VSI_SIGNAL_CADENCE_CONTRACT_VERSION,
  type VsiCadenceObservedDensityLabel,
  type VsiCadenceRegimeKind,
  type VsiCadenceRegimeV2,
  type VsiLvCadenceEvidenceInput,
  type VsiRpmCadenceEvidenceInput,
  type VsiSignalCadenceIntelligenceV2,
} from './vsi-profile-cadence.types';

export const VSI_CADENCE_MIN_INTERVAL_SAMPLES = 3;
export const VSI_CADENCE_MIN_REGIME_SAMPLES = 3;

const POLL_BOUND_MAX_SECONDS = 45 * 60;
const RESTING_HEARTBEAT_MIN_SECONDS = 2 * 3600;

export function percentileSeconds(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx] ?? null;
}

export function medianSeconds(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

export function dedupeSortedTimestampsMs(timestampsMs: number[]): number[] {
  const sorted = [...timestampsMs].sort((a, b) => a - b);
  const out: number[] = [];
  for (const ts of sorted) {
    if (out.length === 0 || out[out.length - 1] !== ts) {
      out.push(ts);
    }
  }
  return out;
}

export function intervalsFromTimestampsMs(timestampsMs: number[]): number[] {
  const deduped = dedupeSortedTimestampsMs(timestampsMs);
  const deltas: number[] = [];
  for (let i = 1; i < deduped.length; i += 1) {
    const delta = (deduped[i]! - deduped[i - 1]!) / 1000;
    if (delta > 0) {
      deltas.push(delta);
    }
  }
  return deltas;
}

export function detectCadenceRegimes(intervalsSeconds: number[]): VsiCadenceRegimeV2[] {
  if (intervalsSeconds.length < VSI_CADENCE_MIN_REGIME_SAMPLES) {
    return [
      {
        kind: 'INSUFFICIENT_EVIDENCE',
        intervalMedianSeconds: null,
        intervalP95Seconds: null,
        sampleCount: intervalsSeconds.length,
        confidence: 'LOW',
      },
    ];
  }

  const pollBound = intervalsSeconds.filter((s) => s <= POLL_BOUND_MAX_SECONDS);
  const resting = intervalsSeconds.filter((s) => s >= RESTING_HEARTBEAT_MIN_SECONDS);
  const regimes: VsiCadenceRegimeV2[] = [];

  if (pollBound.length >= VSI_CADENCE_MIN_REGIME_SAMPLES) {
    const sorted = [...pollBound].sort((a, b) => a - b);
    regimes.push({
      kind: 'POLL_BOUND_ACTIVE',
      intervalMedianSeconds: medianSeconds(pollBound),
      intervalP95Seconds: percentileSeconds(sorted, 95),
      sampleCount: pollBound.length,
      confidence: pollBound.length >= 8 ? 'HIGH' : 'MEDIUM',
    });
  }

  if (resting.length >= VSI_CADENCE_MIN_REGIME_SAMPLES) {
    const sorted = [...resting].sort((a, b) => a - b);
    regimes.push({
      kind: 'PERIODIC_RESTING_HEARTBEAT',
      intervalMedianSeconds: medianSeconds(resting),
      intervalP95Seconds: percentileSeconds(sorted, 95),
      sampleCount: resting.length,
      confidence: resting.length >= 5 ? 'HIGH' : 'MEDIUM',
    });
  }

  const irregular = intervalsSeconds.filter(
    (s) => s > POLL_BOUND_MAX_SECONDS && s < RESTING_HEARTBEAT_MIN_SECONDS,
  );
  if (irregular.length >= VSI_CADENCE_MIN_REGIME_SAMPLES) {
    const sorted = [...irregular].sort((a, b) => a - b);
    regimes.push({
      kind: 'IRREGULAR',
      intervalMedianSeconds: medianSeconds(irregular),
      intervalP95Seconds: percentileSeconds(sorted, 95),
      sampleCount: irregular.length,
      confidence: 'MEDIUM',
    });
  }

  if (regimes.length === 0) {
    const sorted = [...intervalsSeconds].sort((a, b) => a - b);
    return [
      {
        kind: 'IRREGULAR',
        intervalMedianSeconds: medianSeconds(intervalsSeconds),
        intervalP95Seconds: percentileSeconds(sorted, 95),
        sampleCount: intervalsSeconds.length,
        confidence: 'LOW',
      },
    ];
  }

  return regimes;
}

function hashCadenceSemantic(payload: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function buildCadenceFingerprint(parts: Record<string, unknown>): string {
  return hashCadenceSemantic({
    contract: VSI_SIGNAL_CADENCE_CONTRACT_VERSION,
    ...parts,
  });
}

function resolveDensityLabel(
  medianSeconds: number | null,
  limitations: string[],
): VsiCadenceObservedDensityLabel {
  if (limitations.includes('ICE_RPM_NOT_APPLICABLE')) {
    return 'NOT_APPLICABLE';
  }
  if (medianSeconds == null) {
    return 'UNKNOWN';
  }
  if (limitations.includes('DIMO_ONE_SECOND_BUCKET_NOT_NATIVE_SAMPLING_PROOF')) {
    return 'ONE_SECOND_BUCKETS_UNPROVEN';
  }
  if (medianSeconds > 1.05 && medianSeconds < 60) {
    return 'SUB_ONE_HZ';
  }
  if (medianSeconds >= 60) {
    return 'IRREGULAR';
  }
  return 'ONE_SECOND_BUCKETS_UNPROVEN';
}

function resolveEvidenceConfidence(
  sampleCount: number,
  regimes: VsiCadenceRegimeV2[],
): VsiSignalConfidenceLevel {
  if (sampleCount < VSI_CADENCE_MIN_INTERVAL_SAMPLES) {
    return 'LOW';
  }
  if (regimes.some((r) => r.confidence === 'HIGH')) {
    return 'HIGH';
  }
  if (regimes.some((r) => r.confidence === 'MEDIUM')) {
    return 'MEDIUM';
  }
  return 'UNKNOWN';
}

function pointsWithinTripWindows(
  points: readonly { recordedAtMs: number }[],
  trips: readonly { startMs: number; endMs: number }[],
): number[] {
  const out: number[] = [];
  for (const p of points) {
    for (const trip of trips) {
      if (p.recordedAtMs >= trip.startMs && p.recordedAtMs <= trip.endMs) {
        out.push(p.recordedAtMs);
        break;
      }
    }
  }
  return out;
}

function maxGapWithinTripWindows(
  timestampsMs: number[],
  trips: readonly { startMs: number; endMs: number }[],
): number | null {
  let maxGap: number | null = null;
  for (const trip of trips) {
    const inTrip = dedupeSortedTimestampsMs(
      timestampsMs.filter((ts) => ts >= trip.startMs && ts <= trip.endMs),
    );
    const deltas = intervalsFromTimestampsMs(inTrip);
    if (deltas.length === 0) {
      continue;
    }
    const tripMax = Math.max(...deltas);
    maxGap = maxGap == null ? tripMax : Math.max(maxGap, tripMax);
  }
  return maxGap;
}

function computeActiveCoverage(
  timestampsMs: number[],
  trips: readonly { startMs: number; endMs: number }[],
): number | null {
  if (trips.length === 0 || timestampsMs.length === 0) {
    return null;
  }
  const activeMs = trips.reduce((sum, t) => sum + Math.max(0, t.endMs - t.startMs), 0);
  if (activeMs <= 0) {
    return null;
  }
  const spanMs =
    Math.max(...timestampsMs) - Math.min(...timestampsMs);
  return Math.min(1, spanMs / activeMs);
}

export function analyzeEngineRpmCadence(
  input: VsiRpmCadenceEvidenceInput,
): VsiSignalCadenceIntelligenceV2 {
  const limitations: string[] = [
    'ENGINE_STATE_NOT_PERSISTED_OBSERVABILITY_LIMITED',
    'SPEED_ZERO_NOT_IGNITION_OFF_PROOF',
    'MISSING_GPS_NOT_STATIONARY_PROOF',
  ];
  const provenance = [...input.provenance];

  if (!input.iceRpmApplicable) {
    limitations.push('ICE_RPM_NOT_APPLICABLE');
    return {
      contractVersion: VSI_SIGNAL_CADENCE_CONTRACT_VERSION,
      evidenceConfidence: 'HIGH',
      provenance,
      limitations,
      observedSampleCount: 0,
      distinctTimestampCount: 0,
      intervalMedianSeconds: null,
      intervalP95Seconds: null,
      maxIntraWindowGapSeconds: null,
      activeWindowCoverageRatio: null,
      finalizedTripCount: input.tripWindows.length,
      regimes: [
        {
          kind: 'INSUFFICIENT_EVIDENCE',
          intervalMedianSeconds: null,
          intervalP95Seconds: null,
          sampleCount: 0,
          confidence: 'HIGH',
        },
      ],
      observedDensityLabel: 'NOT_APPLICABLE',
      cadenceSemanticFingerprint: buildCadenceFingerprint({
        signal: 'engine_rpm',
        density: 'NOT_APPLICABLE',
        regimes: [],
      }),
    };
  }

  const validPoints = input.points.filter((p) => Number.isFinite(p.value));
  const inTripMs = pointsWithinTripWindows(validPoints, input.tripWindows);
  const distinctTimestampCount = dedupeSortedTimestampsMs(inTripMs).length;
  const intervals = intervalsFromTimestampsMs(inTripMs);
  const sortedIntervals = [...intervals].sort((a, b) => a - b);

  if (validPoints.length > 0) {
    provenance.push('CLICKHOUSE_TELEMETRY_HF_POINTS');
  }
  limitations.push('DIMO_ONE_SECOND_BUCKET_NOT_NATIVE_SAMPLING_PROOF');
  limitations.push('NATIVE_DEVICE_SAMPLING_FREQUENCY_NOT_PROVEN');

  const regimes = detectCadenceRegimes(intervals);
  const intervalMedianSeconds = medianSeconds(intervals);
  const intervalP95Seconds = percentileSeconds(sortedIntervals, 95);
  const maxIntraWindowGapSeconds = maxGapWithinTripWindows(inTripMs, input.tripWindows);

  const cadence: VsiSignalCadenceIntelligenceV2 = {
    contractVersion: VSI_SIGNAL_CADENCE_CONTRACT_VERSION,
    evidenceConfidence: resolveEvidenceConfidence(intervals.length, regimes),
    provenance,
    limitations,
    observedSampleCount: validPoints.length,
    distinctTimestampCount,
    intervalMedianSeconds,
    intervalP95Seconds,
    maxIntraWindowGapSeconds,
    activeWindowCoverageRatio: computeActiveCoverage(inTripMs, input.tripWindows),
    finalizedTripCount: input.tripWindows.length,
    regimes,
    observedDensityLabel: resolveDensityLabel(intervalMedianSeconds, limitations),
    cadenceSemanticFingerprint: '',
  };

  cadence.cadenceSemanticFingerprint = buildCadenceFingerprint({
    signal: 'engine_rpm',
    density: cadence.observedDensityLabel,
    median: intervalMedianSeconds,
    p95: intervalP95Seconds,
    maxGap: maxIntraWindowGapSeconds,
    trips: input.tripWindows.length,
    regimes: regimes.map((r) => ({
      kind: r.kind,
      median: r.intervalMedianSeconds,
      p95: r.intervalP95Seconds,
      n: r.sampleCount,
    })),
  });

  return cadence;
}

export function analyzeLvVoltageCadence(
  input: VsiLvCadenceEvidenceInput,
): VsiSignalCadenceIntelligenceV2 {
  const limitations: string[] = [
    'LV_PROVIDER_TIMESTAMP_MAY_REFLECT_DIMO_BUNDLE_NOT_INDEPENDENT_PHYSICAL_SAMPLE',
    'NATIVE_DEVICE_TRANSMISSION_INTERVAL_NOT_INFERRED_FROM_DIMO_SNAPSHOT_TIMING',
  ];
  const provenance = [...input.provenance, 'POSTGRES_BATTERY_MEASUREMENTS'];

  const linkEnd = input.linkDeactivatedAtMs ?? Number.POSITIVE_INFINITY;
  const scoped = input.points.filter(
    (p) =>
      p.observedAtMs >= input.linkActivatedAtMs && p.observedAtMs <= linkEnd,
  );

  const timestampsMs = scoped.map((p) => p.observedAtMs);
  const intervals = intervalsFromTimestampsMs(timestampsMs);
  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const regimes = detectCadenceRegimes(intervals);
  const intervalMedianSeconds = medianSeconds(intervals);
  const intervalP95Seconds = percentileSeconds(sortedIntervals, 95);
  const maxIntraWindowGapSeconds = intervals.length ? Math.max(...intervals) : null;

  const cadence: VsiSignalCadenceIntelligenceV2 = {
    contractVersion: VSI_SIGNAL_CADENCE_CONTRACT_VERSION,
    evidenceConfidence: resolveEvidenceConfidence(intervals.length, regimes),
    provenance,
    limitations,
    observedSampleCount: scoped.length,
    distinctTimestampCount: dedupeSortedTimestampsMs(timestampsMs).length,
    intervalMedianSeconds,
    intervalP95Seconds,
    maxIntraWindowGapSeconds,
    activeWindowCoverageRatio: null,
    finalizedTripCount: null,
    regimes,
    observedDensityLabel:
      intervals.length < VSI_CADENCE_MIN_INTERVAL_SAMPLES
        ? 'UNKNOWN'
        : resolveDensityLabel(intervalMedianSeconds, limitations),
    cadenceSemanticFingerprint: '',
  };

  cadence.cadenceSemanticFingerprint = buildCadenceFingerprint({
    signal: 'lv_voltage',
    median: intervalMedianSeconds,
    p95: intervalP95Seconds,
    maxGap: maxIntraWindowGapSeconds,
    regimes: regimes.map((r) => ({
      kind: r.kind,
      median: r.intervalMedianSeconds,
      p95: r.intervalP95Seconds,
      n: r.sampleCount,
    })),
    linkActivatedAtMs: input.linkActivatedAtMs,
  });

  return cadence;
}

export function isIceRpmApplicableForFuelType(fuelType: string | null | undefined): boolean {
  if (!fuelType) return false;
  const normalized = fuelType.toUpperCase();
  return !(
    normalized === 'ELECTRIC' ||
    normalized === 'BEV' ||
    normalized === 'EV'
  );
}
