/**
 * Versioned policy for sustained-high-load shadow detector (P37).
 */
import {
  DETECTOR_CADENCE_SHADOW_MAX_MS,
  DETECTOR_MIN_COVERAGE_SHADOW,
} from '../../driving-detector-capability/driving-detector-capability.registry';
import type {
  ShadowCandidateEvent,
  ShadowDetectorHfSample,
} from '../shadow-detector.types';

export const SUSTAINED_HIGH_LOAD_SHADOW_POLICY_VERSION = 'sustained-high-load-shadow-v1';

export const SUSTAINED_HIGH_LOAD_SHADOW_POLICY = {
  version: SUSTAINED_HIGH_LOAD_SHADOW_POLICY_VERSION,
  minSustainedDurationMs: 20_000,
  clusterMaxGapMs: 5_000,
  minClusterSamples: 4,
  highEngineLoadPct: 75,
  highTorquePct: 70,
  highThrottlePct: 65,
  minRpm: 1_800,
  highwaySpeedMinKmh: 80,
  maxEffectiveCadenceMs: DETECTOR_CADENCE_SHADOW_MAX_MS,
  minCoverage: DETECTOR_MIN_COVERAGE_SHADOW,
  minHfSamples: 8,
  defaultMaxRpm: 6_500,
  uphillAltitudeGainM: 12,
  uphillConfidenceReduction: 0.25,
  highwayConfidenceBoost: 0.1,
} as const;

export type SustainedHighLoadShadowPolicy = typeof SUSTAINED_HIGH_LOAD_SHADOW_POLICY;

export type SustainedHighLoadCluster = {
  startedAt: string;
  endedAt: string;
  durationMs: number;
  peakAt: string;
  peakLoadPct: number;
  peakTorquePct: number | null;
  avgSpeedKmh: number | null;
  maxCoolantC: number | null;
  altitudeGainM: number | null;
  uphillContext: boolean;
  highwayContext: boolean;
  sampleCount: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  confidenceFactor: number;
};

function isHighLoadPoint(
  sample: ShadowDetectorHfSample,
  policy: SustainedHighLoadShadowPolicy,
): boolean {
  const loadHigh =
    sample.loadPct != null && sample.loadPct >= policy.highEngineLoadPct;
  const torqueHigh =
    sample.torquePct != null && sample.torquePct >= policy.highTorquePct;
  if (!loadHigh && !torqueHigh) return false;

  const rpmOk = sample.rpm != null && sample.rpm >= policy.minRpm;
  const throttleOk =
    sample.throttlePct != null && sample.throttlePct >= policy.highThrottlePct;
  return rpmOk || throttleOk;
}

function continuesHighLoad(
  sample: ShadowDetectorHfSample,
  policy: SustainedHighLoadShadowPolicy,
): boolean {
  const loadHigh =
    sample.loadPct != null && sample.loadPct >= policy.highEngineLoadPct - 5;
  const torqueHigh =
    sample.torquePct != null && sample.torquePct >= policy.highTorquePct - 5;
  return loadHigh || torqueHigh;
}

function altitudeGainM(slice: readonly ShadowDetectorHfSample[]): number | null {
  const values = slice
    .map((s) => s.altitudeM)
    .filter((v): v is number => v != null);
  if (values.length < 2) return null;
  return Math.max(...values) - Math.min(...values);
}

function avgSpeedKmh(slice: readonly ShadowDetectorHfSample[]): number | null {
  const speeds = slice
    .map((s) => s.speedKmh)
    .filter((v): v is number => v != null);
  if (!speeds.length) return null;
  return speeds.reduce((sum, v) => sum + v, 0) / speeds.length;
}

function maxCoolantC(slice: readonly ShadowDetectorHfSample[]): number | null {
  const values = slice
    .map((s) => s.coolantC)
    .filter((v): v is number => v != null);
  return values.length ? Math.max(...values) : null;
}

function severityForCluster(
  peakLoadPct: number,
  durationMs: number,
  policy: SustainedHighLoadShadowPolicy,
): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (peakLoadPct >= 90 && durationMs >= policy.minSustainedDurationMs * 1.5) {
    return 'HIGH';
  }
  if (peakLoadPct >= policy.highEngineLoadPct && durationMs >= policy.minSustainedDurationMs) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function confidenceFactorForCluster(
  cluster: Omit<SustainedHighLoadCluster, 'confidenceFactor' | 'severity'>,
  policy: SustainedHighLoadShadowPolicy,
): number {
  let factor = 1;
  if (cluster.uphillContext) {
    factor -= policy.uphillConfidenceReduction;
  }
  if (cluster.highwayContext) {
    factor = Math.min(1, factor + policy.highwayConfidenceBoost);
  }
  return Math.round(Math.max(0.2, Math.min(1, factor)) * 100) / 100;
}

export function detectSustainedHighLoadClusters(
  samples: readonly ShadowDetectorHfSample[],
  policy: SustainedHighLoadShadowPolicy = SUSTAINED_HIGH_LOAD_SHADOW_POLICY,
): SustainedHighLoadCluster[] {
  if (samples.length < policy.minClusterSamples) return [];

  const sorted = [...samples].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const clusters: SustainedHighLoadCluster[] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (!isHighLoadPoint(sorted[i], policy)) continue;

    const start = i;
    while (i < sorted.length - 1) {
      const gap =
        new Date(sorted[i + 1].timestamp).getTime() -
        new Date(sorted[i].timestamp).getTime();
      if (gap > policy.clusterMaxGapMs) break;
      if (!continuesHighLoad(sorted[i + 1], policy)) break;
      i += 1;
    }

    const slice = sorted.slice(start, i + 1);
    const startedAt = slice[0].timestamp;
    const endedAt = slice[slice.length - 1].timestamp;
    const durationMs =
      new Date(endedAt).getTime() - new Date(startedAt).getTime();

    if (
      slice.length < policy.minClusterSamples ||
      durationMs < policy.minSustainedDurationMs
    ) {
      continue;
    }

    const peakLoadPct = Math.max(...slice.map((s) => s.loadPct ?? 0));
    const peakTorquePct = (() => {
      const values = slice.map((s) => s.torquePct).filter((v): v is number => v != null);
      return values.length ? Math.max(...values) : null;
    })();
    const speedAvg = avgSpeedKmh(slice);
    const gainM = altitudeGainM(slice);
    const uphillContext =
      gainM != null && gainM >= policy.uphillAltitudeGainM;
    const highwayContext =
      speedAvg != null && speedAvg >= policy.highwaySpeedMinKmh;

    const peakSample = slice.reduce((best, current) =>
      (current.loadPct ?? 0) > (best.loadPct ?? 0) ? current : best,
    );

    const base: Omit<SustainedHighLoadCluster, 'severity' | 'confidenceFactor'> = {
      startedAt,
      endedAt,
      durationMs,
      peakAt: peakSample.timestamp,
      peakLoadPct,
      peakTorquePct,
      avgSpeedKmh: speedAvg,
      maxCoolantC: maxCoolantC(slice),
      altitudeGainM: gainM,
      uphillContext,
      highwayContext,
      sampleCount: slice.length,
    };

    clusters.push({
      ...base,
      severity: severityForCluster(peakLoadPct, durationMs, policy),
      confidenceFactor: confidenceFactorForCluster(base, policy),
    });
  }

  return clusters;
}

export function clustersToCandidateEvents(
  clusters: readonly SustainedHighLoadCluster[],
): ShadowCandidateEvent[] {
  return clusters.map((cluster) => ({
    eventType: 'SUSTAINED_HIGH_ENGINE_LOAD',
    occurredAt: cluster.peakAt,
    severity: cluster.severity,
    peakValue: cluster.peakLoadPct,
    unit: 'load%',
    label: 'shadow_candidate',
  }));
}

export function buildSustainedHighLoadConfidence(input: {
  coverage: number | null;
  clusters: readonly SustainedHighLoadCluster[];
  totalSamples: number;
}): number | null {
  if (!input.clusters.length || input.totalSamples === 0) return null;
  const avgClusterFactor =
    input.clusters.reduce((sum, c) => sum + c.confidenceFactor, 0) /
    input.clusters.length;
  const coverageFactor = input.coverage ?? 0.5;
  const raw = avgClusterFactor * 0.7 + coverageFactor * 0.3;
  return Math.round(Math.max(0, Math.min(1, raw)) * 100) / 100;
}
