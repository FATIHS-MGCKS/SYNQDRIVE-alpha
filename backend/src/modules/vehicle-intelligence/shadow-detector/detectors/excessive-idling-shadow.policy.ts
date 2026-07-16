/**
 * Versioned policy for excessive idling shadow detector (P39).
 */
import {
  DETECTOR_CADENCE_SHADOW_MAX_MS,
  DETECTOR_MIN_COVERAGE_SHADOW,
} from '../../driving-detector-capability/driving-detector-capability.registry';
import type {
  ShadowCandidateEvent,
  ShadowDetectorHfSample,
  ShadowDimoIdlingSegmentRef,
} from '../shadow-detector.types';

export const EXCESSIVE_IDLING_SHADOW_POLICY_VERSION = 'excessive-idling-shadow-v1';

export const EXCESSIVE_IDLING_SHADOW_POLICY = {
  version: EXCESSIVE_IDLING_SHADOW_POLICY_VERSION,
  stationarySpeedMaxKmh: 3,
  defaultIdleRpm: 800,
  idleRpmMinMultiplier: 0.4,
  idleRpmMaxMultiplier: 1.5,
  minExcessiveIdleDurationMs: 180_000,
  shortIdleMaxDurationMs: 120_000,
  clusterMaxGapMs: 10_000,
  minClusterSamples: 4,
  dimoIdlingMinDurationSec: 180,
  maxEffectiveCadenceMs: DETECTOR_CADENCE_SHADOW_MAX_MS,
  minCoverage: DETECTOR_MIN_COVERAGE_SHADOW,
  minHfSamples: 8,
} as const;

export type ExcessiveIdlingShadowPolicy = typeof EXCESSIVE_IDLING_SHADOW_POLICY;

export type ExcessiveIdlingCluster = {
  startedAt: string;
  endedAt: string;
  durationMs: number;
  peakAt: string;
  source: 'HF' | 'DIMO_IDLING_SEGMENT' | 'HF_DIMO_CORROBORATED';
  dimoSegmentId: string | null;
  ignitionOnObserved: boolean;
  avgRpm: number | null;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
};

function isStationaryEntry(
  sample: ShadowDetectorHfSample,
  policy: ExcessiveIdlingShadowPolicy,
  isEv: boolean,
): boolean {
  if (sample.speedKmh == null || sample.speedKmh >= policy.stationarySpeedMaxKmh) {
    return false;
  }
  if (isEv) return true;
  return (
    sample.rpm != null &&
    sample.rpm > policy.defaultIdleRpm * policy.idleRpmMinMultiplier &&
    sample.rpm < policy.defaultIdleRpm * policy.idleRpmMaxMultiplier
  );
}

function continuesStationary(
  sample: ShadowDetectorHfSample,
  policy: ExcessiveIdlingShadowPolicy,
  isEv: boolean,
): boolean {
  if (sample.speedKmh == null || sample.speedKmh >= policy.stationarySpeedMaxKmh) {
    return false;
  }
  if (isEv) return true;
  return sample.rpm != null && sample.rpm > policy.defaultIdleRpm * policy.idleRpmMinMultiplier;
}

export function detectExcessiveIdlingFromHf(
  samples: readonly ShadowDetectorHfSample[],
  isEvPowertrain: boolean,
  policy: ExcessiveIdlingShadowPolicy = EXCESSIVE_IDLING_SHADOW_POLICY,
): ExcessiveIdlingCluster[] {
  const sorted = [...samples].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const clusters: ExcessiveIdlingCluster[] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (!isStationaryEntry(sorted[i], policy, isEvPowertrain)) continue;

    const start = i;
    while (i < sorted.length - 1) {
      const gap =
        new Date(sorted[i + 1].timestamp).getTime() -
        new Date(sorted[i].timestamp).getTime();
      if (gap > policy.clusterMaxGapMs) break;
      if (!continuesStationary(sorted[i + 1], policy, isEvPowertrain)) break;
      i += 1;
    }

    const slice = sorted.slice(start, i + 1);
    const durationMs =
      new Date(slice[slice.length - 1].timestamp).getTime() -
      new Date(slice[0].timestamp).getTime();

    if (
      slice.length < policy.minClusterSamples ||
      durationMs < policy.minExcessiveIdleDurationMs ||
      durationMs <= policy.shortIdleMaxDurationMs
    ) {
      continue;
    }

    const rpmValues = slice.map((s) => s.rpm).filter((v): v is number => v != null);
    clusters.push({
      startedAt: slice[0].timestamp,
      endedAt: slice[slice.length - 1].timestamp,
      durationMs,
      peakAt: slice[Math.floor(slice.length / 2)].timestamp,
      source: 'HF',
      dimoSegmentId: null,
      ignitionOnObserved: slice.some((s) => s.ignitionOn === true),
      avgRpm: rpmValues.length
        ? rpmValues.reduce((a, b) => a + b, 0) / rpmValues.length
        : null,
      severity: durationMs >= policy.minExcessiveIdleDurationMs * 2 ? 'HIGH' : 'MEDIUM',
    });
  }

  return clusters;
}

export function detectExcessiveIdlingFromDimoSegments(
  segments: readonly ShadowDimoIdlingSegmentRef[],
  policy: ExcessiveIdlingShadowPolicy = EXCESSIVE_IDLING_SHADOW_POLICY,
): ExcessiveIdlingCluster[] {
  return segments
    .filter((segment) => segment.durationSeconds >= policy.dimoIdlingMinDurationSec)
    .map((segment) => ({
      startedAt: segment.startTime,
      endedAt: segment.endTime ?? segment.startTime,
      durationMs: segment.durationSeconds * 1000,
      peakAt: segment.startTime,
      source: 'DIMO_IDLING_SEGMENT' as const,
      dimoSegmentId: segment.segmentId,
      ignitionOnObserved: false,
      avgRpm: null,
      severity:
        segment.durationSeconds >= policy.dimoIdlingMinDurationSec * 2 ? 'HIGH' : 'MEDIUM',
    }));
}

export function mergeExcessiveIdlingClusters(
  hfClusters: readonly ExcessiveIdlingCluster[],
  dimoClusters: readonly ExcessiveIdlingCluster[],
): ExcessiveIdlingCluster[] {
  const merged = [...hfClusters];
  for (const dimo of dimoClusters) {
    const overlap = merged.find((hf) => clustersOverlap(hf, dimo));
    if (overlap) {
      overlap.source = 'HF_DIMO_CORROBORATED';
      overlap.dimoSegmentId = dimo.dimoSegmentId;
    } else {
      merged.push(dimo);
    }
  }
  return merged.sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
}

function clustersOverlap(a: ExcessiveIdlingCluster, b: ExcessiveIdlingCluster): boolean {
  const aStart = new Date(a.startedAt).getTime();
  const aEnd = new Date(a.endedAt).getTime();
  const bStart = new Date(b.startedAt).getTime();
  const bEnd = new Date(b.endedAt).getTime();
  return aStart <= bEnd && bStart <= aEnd;
}

export function clustersToCandidateEvents(
  clusters: readonly ExcessiveIdlingCluster[],
): ShadowCandidateEvent[] {
  return clusters.map((cluster) => ({
    eventType: 'EXCESSIVE_IDLING',
    occurredAt: cluster.peakAt,
    severity: cluster.severity,
    peakValue: Math.round((cluster.durationMs / 60_000) * 10) / 10,
    unit: 'minutes',
    label: 'shadow_candidate',
  }));
}

export function summarizeClustersForContext(
  clusters: readonly ExcessiveIdlingCluster[],
): string {
  return JSON.stringify(
    clusters.slice(0, 5).map((c) => ({
      start: c.startedAt,
      end: c.endedAt,
      durationMs: c.durationMs,
      source: c.source,
      dimoSegmentId: c.dimoSegmentId,
      ignitionOn: c.ignitionOnObserved,
    })),
  );
}

export function buildExcessiveIdlingConfidence(input: {
  coverage: number | null;
  clusters: readonly ExcessiveIdlingCluster[];
  dimoSegmentCount: number;
}): number | null {
  if (!input.clusters.length) return null;
  const corroborated = input.clusters.filter(
    (c) => c.source === 'HF_DIMO_CORROBORATED',
  ).length;
  const base =
    input.clusters.reduce((sum, c) => sum + Math.min(1, c.durationMs / 180_000), 0) /
    input.clusters.length;
  const dimoBoost = input.dimoSegmentCount > 0 ? 0.1 : 0;
  const corroborationBoost = corroborated > 0 ? 0.1 : 0;
  const coverageFactor = input.coverage ?? 0.5;
  return Math.round(
    Math.min(1, base * 0.55 + coverageFactor * 0.25 + dimoBoost + corroborationBoost) * 100,
  ) / 100;
}
