/**
 * Versioned policy for high RPM while stationary shadow detector (P39).
 */
import {
  DETECTOR_CADENCE_DEGRADED_MAX_MS,
  DETECTOR_MIN_COVERAGE_SHADOW,
} from '../../driving-detector-capability/driving-detector-capability.registry';
import type {
  ShadowCandidateEvent,
  ShadowDetectorHfSample,
} from '../shadow-detector.types';

export const HIGH_RPM_STATIONARY_SHADOW_POLICY_VERSION = 'high-rpm-stationary-shadow-v1';

export const HIGH_RPM_STATIONARY_SHADOW_POLICY = {
  version: HIGH_RPM_STATIONARY_SHADOW_POLICY_VERSION,
  stationarySpeedMaxKmh: 5,
  defaultIdleRpm: 800,
  highRpmIdleMultiplier: 2.5,
  continuationRpmMultiplier: 1.8,
  minClusterDurationMs: 3_000,
  minSynchronizedSamples: 3,
  clusterMaxGapMs: 4_000,
  maxSampleSyncDeltaMs: 6_000,
  maxEffectiveCadenceMs: DETECTOR_CADENCE_DEGRADED_MAX_MS,
  minCoverage: DETECTOR_MIN_COVERAGE_SHADOW,
  minHfSamples: 6,
} as const;

export type HighRpmStationaryShadowPolicy = typeof HIGH_RPM_STATIONARY_SHADOW_POLICY;

export type HighRpmStationaryCluster = {
  startedAt: string;
  endedAt: string;
  durationMs: number;
  peakAt: string;
  peakRpm: number;
  synchronizedSampleCount: number;
  syncDeltaMs: number | null;
  ignitionOnObserved: boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
};

function rpmThresholds(policy: HighRpmStationaryShadowPolicy) {
  return {
    entry: policy.defaultIdleRpm * policy.highRpmIdleMultiplier,
    continuation: policy.defaultIdleRpm * policy.continuationRpmMultiplier,
  };
}

function isStationary(sample: ShadowDetectorHfSample, policy: HighRpmStationaryShadowPolicy): boolean {
  return sample.speedKmh != null && sample.speedKmh < policy.stationarySpeedMaxKmh;
}

export function detectHighRpmStationaryClusters(
  samples: readonly ShadowDetectorHfSample[],
  policy: HighRpmStationaryShadowPolicy = HIGH_RPM_STATIONARY_SHADOW_POLICY,
): HighRpmStationaryCluster[] {
  const sorted = [...samples].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  if (sorted.length < policy.minSynchronizedSamples) return [];

  const thresholds = rpmThresholds(policy);
  const clusters: HighRpmStationaryCluster[] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (
      !isStationary(sorted[i], policy) ||
      sorted[i].rpm == null ||
      sorted[i].rpm! < thresholds.entry
    ) {
      continue;
    }

    const start = i;
    while (i < sorted.length - 1) {
      const gap =
        new Date(sorted[i + 1].timestamp).getTime() -
        new Date(sorted[i].timestamp).getTime();
      if (gap > policy.clusterMaxGapMs) break;
      const next = sorted[i + 1];
      if (
        !isStationary(next, policy) ||
        next.rpm == null ||
        next.rpm < thresholds.continuation
      ) {
        break;
      }
      i += 1;
    }

    const slice = sorted.slice(start, i + 1);
    const durationMs =
      new Date(slice[slice.length - 1].timestamp).getTime() -
      new Date(slice[0].timestamp).getTime();

    if (
      slice.length < policy.minSynchronizedSamples ||
      durationMs < policy.minClusterDurationMs
    ) {
      continue;
    }

    const peakRpm = Math.max(...slice.map((s) => s.rpm ?? 0));
    const peakSample = slice.reduce((best, s) =>
      (s.rpm ?? 0) > (best.rpm ?? 0) ? s : best,
    );
    const syncDeltaMs = computeSyncDeltaMs(slice);
    if (syncDeltaMs != null && syncDeltaMs > policy.maxSampleSyncDeltaMs) continue;

    clusters.push({
      startedAt: slice[0].timestamp,
      endedAt: slice[slice.length - 1].timestamp,
      durationMs,
      peakAt: peakSample.timestamp,
      peakRpm,
      synchronizedSampleCount: slice.length,
      syncDeltaMs,
      ignitionOnObserved: slice.some((s) => s.ignitionOn === true),
      severity: peakRpm >= thresholds.entry * 1.3 ? 'HIGH' : 'MEDIUM',
    });
  }

  return clusters;
}

function computeSyncDeltaMs(slice: ShadowDetectorHfSample[]): number | null {
  const timestamps = slice.map((s) => new Date(s.timestamp).getTime());
  return Math.max(...timestamps) - Math.min(...timestamps);
}

export function clustersToCandidateEvents(
  clusters: readonly HighRpmStationaryCluster[],
): ShadowCandidateEvent[] {
  return clusters.map((cluster) => ({
    eventType: 'HIGH_RPM_WHILE_STATIONARY_PROXY',
    occurredAt: cluster.peakAt,
    severity: cluster.severity,
    peakValue: cluster.peakRpm,
    unit: 'rpm',
    label: 'shadow_candidate',
  }));
}

export function summarizeClustersForContext(
  clusters: readonly HighRpmStationaryCluster[],
): string {
  return JSON.stringify(
    clusters.slice(0, 5).map((c) => ({
      start: c.startedAt,
      end: c.endedAt,
      durationMs: c.durationMs,
      peakRpm: c.peakRpm,
      syncSamples: c.synchronizedSampleCount,
      ignitionOn: c.ignitionOnObserved,
    })),
  );
}

export function buildHighRpmStationaryConfidence(input: {
  coverage: number | null;
  clusters: readonly HighRpmStationaryCluster[];
}): number | null {
  if (!input.clusters.length) return null;
  const syncFactor =
    input.clusters.reduce((sum, c) => sum + c.synchronizedSampleCount, 0) /
    input.clusters.length /
    HIGH_RPM_STATIONARY_SHADOW_POLICY.minSynchronizedSamples;
  const coverageFactor = input.coverage ?? 0.5;
  return Math.round(Math.min(1, syncFactor * 0.6 + coverageFactor * 0.4) * 100) / 100;
}
