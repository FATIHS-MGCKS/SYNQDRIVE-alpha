/**
 * Versioned policy for kickdown-like shadow detector (P38).
 * Never claims a real OEM kickdown — only KICKDOWN_LIKE_PROXY candidates.
 */
import {
  DETECTOR_CADENCE_SHADOW_MAX_MS,
  DETECTOR_MIN_COVERAGE_SHADOW,
} from '../../driving-detector-capability/driving-detector-capability.registry';
import type {
  ShadowCandidateEvent,
  ShadowDetectorHfSample,
} from '../shadow-detector.types';

export const KICKDOWN_LIKE_SHADOW_POLICY_VERSION = 'kickdown-like-shadow-v1';

export const KICKDOWN_LIKE_SHADOW_POLICY = {
  version: KICKDOWN_LIKE_SHADOW_POLICY_VERSION,
  prevThrottleMaxPct: 40,
  entryThrottleMinPct: 88,
  throttleRiseWindowMs: 3_000,
  minInMotionSpeedKmh: 25,
  minThrottleRisePct: 45,
  minThrottleRisePctPerSec: 18,
  normalAccelMaxPeakThrottlePct: 78,
  minRpmRise: 350,
  minSpeedRiseKmh: 8,
  minEngineLoadPct: 65,
  minTorquePct: 55,
  maxSignalSyncDeltaMs: 2_500,
  clusterMaxGapMs: 4_000,
  minClusterDurationMs: 400,
  maxClusterDurationMs: 5_000,
  minClusterSamples: 2,
  maxEffectiveCadenceMs: DETECTOR_CADENCE_SHADOW_MAX_MS,
  minCoverage: DETECTOR_MIN_COVERAGE_SHADOW,
  minHfSamples: 8,
  gearChangeWindowMs: 4_000,
} as const;

export type KickdownLikeShadowPolicy = typeof KICKDOWN_LIKE_SHADOW_POLICY;

export type KickdownLikeCluster = {
  startedAt: string;
  endedAt: string;
  durationMs: number;
  peakAt: string;
  peakThrottlePct: number;
  throttleRisePct: number;
  rpmRise: number | null;
  speedRiseKmh: number | null;
  peakLoadPct: number | null;
  peakTorquePct: number | null;
  syncDeltaMs: number | null;
  gearSignalAvailable: boolean;
  gearChangeObserved: boolean;
  startGear: number | null;
  endGear: number | null;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  confidenceFactor: number;
};

export function isGearSignalAvailable(
  samples: readonly ShadowDetectorHfSample[],
): boolean {
  return samples.some((s) => s.gear != null);
}

function sortedSamples(samples: readonly ShadowDetectorHfSample[]): ShadowDetectorHfSample[] {
  return [...samples].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

function peakIndex(
  slice: ShadowDetectorHfSample[],
  pick: (s: ShadowDetectorHfSample) => number,
): number {
  let bestIdx = 0;
  let bestVal = pick(slice[0]);
  for (let i = 1; i < slice.length; i++) {
    const val = pick(slice[i]);
    if (val > bestVal) {
      bestVal = val;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function isNormalAcceleration(
  slice: ShadowDetectorHfSample[],
  policy: KickdownLikeShadowPolicy,
): boolean {
  const peakThrottle = Math.max(...slice.map((s) => s.throttlePct ?? 0));
  if (peakThrottle <= policy.normalAccelMaxPeakThrottlePct) return true;

  const start = slice[0];
  const end = slice[slice.length - 1];
  const durationSec =
    (new Date(end.timestamp).getTime() - new Date(start.timestamp).getTime()) / 1000;
  if (durationSec <= 0) return true;

  const throttleRise = (end.throttlePct ?? 0) - (start.throttlePct ?? 0);
  const risePerSec = throttleRise / durationSec;
  return risePerSec < policy.minThrottleRisePctPerSec;
}

function loadOrTorqueSupports(
  slice: ShadowDetectorHfSample[],
  policy: KickdownLikeShadowPolicy,
): boolean {
  const loadValues = slice.map((s) => s.loadPct).filter((v): v is number => v != null);
  const torqueValues = slice.map((s) => s.torquePct).filter((v): v is number => v != null);
  const loadOk =
    loadValues.length > 0 && Math.max(...loadValues) >= policy.minEngineLoadPct;
  const torqueOk =
    torqueValues.length > 0 && Math.max(...torqueValues) >= policy.minTorquePct;
  if (loadValues.length === 0 && torqueValues.length === 0) return true;
  return loadOk || torqueOk;
}

function computeSyncDeltaMs(slice: ShadowDetectorHfSample[]): number | null {
  const rpmValues = slice.map((s) => s.rpm).filter((v): v is number => v != null);
  if (!rpmValues.length) return null;
  const throttleIdx = peakIndex(slice, (s) => s.throttlePct ?? 0);
  const rpmIdx = peakIndex(slice, (s) => s.rpm ?? 0);
  return Math.abs(
    new Date(slice[rpmIdx].timestamp).getTime() -
      new Date(slice[throttleIdx].timestamp).getTime(),
  );
}

function gearContextForSlice(
  slice: ShadowDetectorHfSample[],
  gearAvailable: boolean,
): Pick<
  KickdownLikeCluster,
  'gearSignalAvailable' | 'gearChangeObserved' | 'startGear' | 'endGear'
> {
  if (!gearAvailable) {
    return {
      gearSignalAvailable: false,
      gearChangeObserved: false,
      startGear: null,
      endGear: null,
    };
  }
  const gears = slice.map((s) => s.gear).filter((g): g is number => g != null);
  const startGear = gears[0] ?? null;
  const endGear = gears[gears.length - 1] ?? null;
  return {
    gearSignalAvailable: true,
    gearChangeObserved: gears.length >= 2 && new Set(gears).size > 1,
    startGear,
    endGear,
  };
}

function severityForCluster(
  peakThrottle: number,
  throttleRise: number,
  policy: KickdownLikeShadowPolicy,
): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (peakThrottle >= 95 && throttleRise >= 55) return 'HIGH';
  if (peakThrottle >= policy.entryThrottleMinPct && throttleRise >= policy.minThrottleRisePct) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function confidenceForCluster(
  cluster: Omit<KickdownLikeCluster, 'severity' | 'confidenceFactor'>,
  policy: KickdownLikeShadowPolicy,
): number {
  let factor = 0.75;
  if (cluster.rpmRise != null && cluster.rpmRise >= policy.minRpmRise) factor += 0.1;
  if (cluster.speedRiseKmh != null && cluster.speedRiseKmh >= policy.minSpeedRiseKmh) {
    factor += 0.05;
  }
  if (cluster.syncDeltaMs != null && cluster.syncDeltaMs <= policy.maxSignalSyncDeltaMs) {
    factor += 0.05;
  }
  if (cluster.gearChangeObserved) factor += 0.05;
  return Math.round(Math.min(1, factor) * 100) / 100;
}

export function detectKickdownLikeClusters(
  samples: readonly ShadowDetectorHfSample[],
  policy: KickdownLikeShadowPolicy = KICKDOWN_LIKE_SHADOW_POLICY,
): KickdownLikeCluster[] {
  const sorted = sortedSamples(samples);
  if (sorted.length < policy.minClusterSamples + 1) return [];

  const gearAvailable = isGearSignalAvailable(sorted);
  const clusters: KickdownLikeCluster[] = [];

  for (let i = 2; i < sorted.length; i++) {
    const prev = sorted[i - 2];
    const cur = sorted[i];
    if (prev.throttlePct == null || cur.throttlePct == null) continue;
    if (prev.throttlePct > policy.prevThrottleMaxPct) continue;
    if (cur.throttlePct < policy.entryThrottleMinPct) continue;

    const durationMs =
      new Date(cur.timestamp).getTime() - new Date(prev.timestamp).getTime();
    if (durationMs > policy.throttleRiseWindowMs) continue;
    if (durationMs < policy.minClusterDurationMs) continue;

    const startSpeed = prev.speedKmh ?? 0;
    if (startSpeed < policy.minInMotionSpeedKmh) continue;

    const throttleRise = cur.throttlePct - prev.throttlePct;
    if (throttleRise < policy.minThrottleRisePct) continue;

    const risePerSec = throttleRise / (durationMs / 1000);
    if (risePerSec < policy.minThrottleRisePctPerSec) continue;

    const slice = sorted.slice(i - 2, i + 1);
    if (isNormalAcceleration(slice, policy)) continue;
    if (!loadOrTorqueSupports(slice, policy)) continue;

    const rpmStart = prev.rpm ?? 0;
    const rpmPeak = Math.max(...slice.map((s) => s.rpm ?? 0));
    const rpmRise = rpmPeak > 0 ? rpmPeak - rpmStart : null;
    if (rpmRise != null && rpmRise < policy.minRpmRise) continue;

    const speedPeak = Math.max(...slice.map((s) => s.speedKmh ?? 0));
    const speedRise = speedPeak - startSpeed;
    if (speedRise < policy.minSpeedRiseKmh) continue;

    const syncDeltaMs = computeSyncDeltaMs(slice);
    if (
      syncDeltaMs != null &&
      syncDeltaMs > policy.maxSignalSyncDeltaMs
    ) {
      continue;
    }

    const peakThrottle = Math.max(...slice.map((s) => s.throttlePct ?? 0));
    const peakSample = slice.reduce((best, s) =>
      (s.throttlePct ?? 0) > (best.throttlePct ?? 0) ? s : best,
    );
    const loadValues = slice.map((s) => s.loadPct).filter((v): v is number => v != null);
    const torqueValues = slice.map((s) => s.torquePct).filter((v): v is number => v != null);

    const gearCtx = gearContextForSlice(slice, gearAvailable);
    const base: Omit<KickdownLikeCluster, 'severity' | 'confidenceFactor'> = {
      startedAt: prev.timestamp,
      endedAt: cur.timestamp,
      durationMs,
      peakAt: peakSample.timestamp,
      peakThrottlePct: peakThrottle,
      throttleRisePct: throttleRise,
      rpmRise,
      speedRiseKmh: speedRise,
      peakLoadPct: loadValues.length ? Math.max(...loadValues) : null,
      peakTorquePct: torqueValues.length ? Math.max(...torqueValues) : null,
      syncDeltaMs,
      ...gearCtx,
    };

    clusters.push({
      ...base,
      severity: severityForCluster(peakThrottle, throttleRise, policy),
      confidenceFactor: confidenceForCluster(base, policy),
    });
  }

  return dedupeClusters(clusters, policy.clusterMaxGapMs);
}

function dedupeClusters(
  clusters: KickdownLikeCluster[],
  maxGapMs: number,
): KickdownLikeCluster[] {
  if (clusters.length <= 1) return clusters;
  const sorted = [...clusters].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const out: KickdownLikeCluster[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1];
    const gap =
      new Date(sorted[i].startedAt).getTime() - new Date(prev.endedAt).getTime();
    if (gap <= maxGapMs) {
      if (sorted[i].peakThrottlePct > prev.peakThrottlePct) {
        out[out.length - 1] = sorted[i];
      }
    } else {
      out.push(sorted[i]);
    }
  }
  return out;
}

/** Without gear signal only KICKDOWN_LIKE_PROXY — never a real kickdown claim. */
export function clustersToCandidateEvents(
  clusters: readonly KickdownLikeCluster[],
): ShadowCandidateEvent[] {
  return clusters.map((cluster) => ({
    eventType: 'KICKDOWN_LIKE_PROXY',
    occurredAt: cluster.peakAt,
    severity: cluster.severity,
    peakValue: cluster.peakThrottlePct,
    unit: 'throttle%',
    label: 'shadow_candidate',
  }));
}

export function buildKickdownLikeConfidence(input: {
  coverage: number | null;
  clusters: readonly KickdownLikeCluster[];
}): number | null {
  if (!input.clusters.length) return null;
  const avg =
    input.clusters.reduce((sum, c) => sum + c.confidenceFactor, 0) /
    input.clusters.length;
  const coverageFactor = input.coverage ?? 0.5;
  return Math.round(Math.min(1, avg * 0.75 + coverageFactor * 0.25) * 100) / 100;
}

export function summarizeClustersForContext(
  clusters: readonly KickdownLikeCluster[],
): string {
  return JSON.stringify(
    clusters.slice(0, 5).map((c) => ({
      start: c.startedAt,
      end: c.endedAt,
      durationMs: c.durationMs,
      throttleRise: c.throttleRisePct,
      rpmRise: c.rpmRise,
      speedRise: c.speedRiseKmh,
      gearChange: c.gearChangeObserved,
      syncMs: c.syncDeltaMs,
    })),
  );
}
