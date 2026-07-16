/**
 * Versioned policy for cold-engine-load shadow detector (P36).
 * Thresholds live here — detector logic must not hardcode values.
 */
import {
  DETECTOR_CADENCE_SHADOW_MAX_MS,
  DETECTOR_MIN_COVERAGE_SHADOW,
} from '../../driving-detector-capability/driving-detector-capability.registry';
import type {
  ShadowCandidateEvent,
  ShadowDetectorHfSample,
} from '../shadow-detector.types';

export const COLD_ENGINE_SHADOW_POLICY_VERSION = 'cold-engine-shadow-v1';

export const COLD_ENGINE_SHADOW_POLICY = {
  version: COLD_ENGINE_SHADOW_POLICY_VERSION,
  coldCoolantMaxC: 60,
  clusterMinDurationMs: 2_000,
  clusterMaxGapMs: 5_000,
  minClusterSamples: 2,
  highLoadEngineLoadPct: 80,
  highLoadRpmPctOfMax: 0.75,
  highLoadThrottleEntryPct: 85,
  highLoadThrottleContinuePct: 80,
  highTorquePct: 70,
  fullThrottleMinDurationMs: 1_500,
  maxEffectiveCadenceMs: DETECTOR_CADENCE_SHADOW_MAX_MS,
  minCoverage: DETECTOR_MIN_COVERAGE_SHADOW,
  minHfSamples: 8,
  iceRpmMin: 400,
  iceLoadMinPct: 10,
  iceConfirmationMinSamples: 3,
  defaultMaxRpm: 6_500,
  defaultIdleRpm: 800,
} as const;

export type ColdEngineShadowPolicy = typeof COLD_ENGINE_SHADOW_POLICY;

export type ColdEngineClusterKind =
  | 'COLD_ENGINE_HIGH_LOAD'
  | 'COLD_ENGINE_HIGH_RPM'
  | 'COLD_ENGINE_FULL_THROTTLE';

export type ColdEngineLoadCluster = {
  kind: ColdEngineShadowClusterKind;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  peakAt: string;
  peakValue: number;
  peakUnit: string;
  maxCoolantC: number;
  sampleCount: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
};

type ColdEngineShadowClusterKind = ColdEngineClusterKind;

export function isPhevFuelType(fuelType: string | null | undefined): boolean {
  if (!fuelType) return false;
  const normalized = fuelType.toUpperCase();
  return normalized === 'PLUGIN_HYBRID' || normalized === 'PHEV' || normalized === 'PLUGINHYBRID';
}

export function confirmIceOperation(
  samples: readonly ShadowDetectorHfSample[],
  policy: ColdEngineShadowPolicy = COLD_ENGINE_SHADOW_POLICY,
): { confirmed: boolean; iceSampleCount: number } {
  let iceSampleCount = 0;
  for (const sample of samples) {
    const rpmActive = sample.rpm != null && sample.rpm >= policy.iceRpmMin;
    const loadActive = sample.loadPct != null && sample.loadPct >= policy.iceLoadMinPct;
    if (rpmActive || loadActive) iceSampleCount += 1;
  }
  return {
    confirmed: iceSampleCount >= policy.iceConfirmationMinSamples,
    iceSampleCount,
  };
}

export function computeHfCadenceCoverage(samples: readonly ShadowDetectorHfSample[]): {
  effectiveCadenceMs: number | null;
  p95CadenceMs: number | null;
  coverage: number | null;
} {
  if (samples.length < 2) {
    return { effectiveCadenceMs: null, p95CadenceMs: null, coverage: null };
  }

  const timestamps = samples
    .map((s) => new Date(s.timestamp).getTime())
    .sort((a, b) => a - b);
  const intervals: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1]);
  }
  if (intervals.length === 0) {
    return { effectiveCadenceMs: null, p95CadenceMs: null, coverage: null };
  }

  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? null;
  const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  const p95 = sorted[p95Idx] ?? null;

  const spanMs = timestamps[timestamps.length - 1] - timestamps[0];
  const expected = median != null && median > 0 ? spanMs / median + 1 : samples.length;
  const coverage = Math.min(1, samples.length / Math.max(1, expected));

  return { effectiveCadenceMs: median, p95CadenceMs: p95, coverage };
}

export function assessCadenceCoverageGate(input: {
  effectiveCadenceMs: number | null;
  coverage: number | null;
  sampleCount: number;
  capabilityCadenceMs: number | null;
  capabilityCoverage: number | null;
  policy?: ColdEngineShadowPolicy;
}): { passed: boolean; rejectionReasons: string[] } {
  const policy = input.policy ?? COLD_ENGINE_SHADOW_POLICY;
  const rejectionReasons: string[] = [];

  const cadence = input.capabilityCadenceMs ?? input.effectiveCadenceMs;
  const coverage = input.capabilityCoverage ?? input.coverage;

  if (input.sampleCount < policy.minHfSamples) {
    rejectionReasons.push('INSUFFICIENT_HF_SAMPLES');
  }
  if (cadence != null && cadence > policy.maxEffectiveCadenceMs) {
    rejectionReasons.push('CADENCE_TOO_SPARSE');
  }
  if (coverage != null && coverage < policy.minCoverage) {
    rejectionReasons.push('COVERAGE_BELOW_MINIMUM');
  }

  return { passed: rejectionReasons.length === 0, rejectionReasons };
}

function isColdSample(
  sample: ShadowDetectorHfSample,
  policy: ColdEngineShadowPolicy,
): boolean {
  return sample.coolantC != null && sample.coolantC < policy.coldCoolantMaxC;
}

function highRpmThreshold(policy: ColdEngineShadowPolicy): number {
  return policy.defaultMaxRpm * policy.highLoadRpmPctOfMax;
}

function classifyHighLoadKind(
  sample: ShadowDetectorHfSample,
  policy: ColdEngineShadowPolicy,
): ColdEngineClusterKind | null {
  if (!isColdSample(sample, policy)) return null;

  if (sample.loadPct != null && sample.loadPct >= policy.highLoadEngineLoadPct) {
    return 'COLD_ENGINE_HIGH_LOAD';
  }
  if (sample.rpm != null && sample.rpm >= highRpmThreshold(policy)) {
    return 'COLD_ENGINE_HIGH_RPM';
  }
  if (
    sample.throttlePct != null &&
    sample.throttlePct >= policy.highLoadThrottleEntryPct
  ) {
    return 'COLD_ENGINE_FULL_THROTTLE';
  }
  if (sample.torquePct != null && sample.torquePct >= policy.highTorquePct) {
    return 'COLD_ENGINE_HIGH_LOAD';
  }
  return null;
}

function continuesCluster(
  sample: ShadowDetectorHfSample,
  kind: ColdEngineClusterKind,
  policy: ColdEngineShadowPolicy,
): boolean {
  if (!isColdSample(sample, policy)) return false;

  switch (kind) {
    case 'COLD_ENGINE_HIGH_LOAD':
      return (
        (sample.loadPct != null && sample.loadPct >= policy.highLoadEngineLoadPct) ||
        (sample.torquePct != null && sample.torquePct >= policy.highTorquePct)
      );
    case 'COLD_ENGINE_HIGH_RPM':
      return sample.rpm != null && sample.rpm >= highRpmThreshold(policy);
    case 'COLD_ENGINE_FULL_THROTTLE':
      return (
        sample.throttlePct != null &&
        sample.throttlePct >= policy.highLoadThrottleContinuePct
      );
    default:
      return false;
  }
}

function minDurationForKind(
  kind: ColdEngineClusterKind,
  policy: ColdEngineShadowPolicy,
): number {
  return kind === 'COLD_ENGINE_FULL_THROTTLE'
    ? policy.fullThrottleMinDurationMs
    : policy.clusterMinDurationMs;
}

function peakValueForKind(
  slice: ShadowDetectorHfSample[],
  kind: ColdEngineClusterKind,
  policy: ColdEngineShadowPolicy,
): { peakValue: number; peakUnit: string } {
  switch (kind) {
    case 'COLD_ENGINE_HIGH_LOAD': {
      const loadPeak = Math.max(...slice.map((s) => s.loadPct ?? 0));
      if (loadPeak > 0) return { peakValue: loadPeak, peakUnit: 'load%' };
      const torquePeak = Math.max(...slice.map((s) => s.torquePct ?? 0));
      return { peakValue: torquePeak, peakUnit: 'torque%' };
    }
    case 'COLD_ENGINE_HIGH_RPM':
      return {
        peakValue: Math.max(...slice.map((s) => s.rpm ?? 0)),
        peakUnit: 'rpm',
      };
    case 'COLD_ENGINE_FULL_THROTTLE':
      return {
        peakValue: Math.max(...slice.map((s) => s.throttlePct ?? 0)),
        peakUnit: 'throttle%',
      };
    default:
      return { peakValue: 0, peakUnit: 'unknown' };
  }
}

function severityForCluster(
  kind: ColdEngineClusterKind,
  peakValue: number,
  policy: ColdEngineShadowPolicy,
): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (kind === 'COLD_ENGINE_HIGH_RPM' && peakValue >= policy.defaultMaxRpm * 0.85) {
    return 'HIGH';
  }
  if (kind === 'COLD_ENGINE_FULL_THROTTLE' && peakValue >= 95) return 'HIGH';
  if (kind === 'COLD_ENGINE_HIGH_LOAD' && peakValue >= 90) return 'HIGH';
  if (peakValue >= policy.highLoadEngineLoadPct) return 'MEDIUM';
  return 'LOW';
}

export function detectColdEngineLoadClusters(
  samples: readonly ShadowDetectorHfSample[],
  policy: ColdEngineShadowPolicy = COLD_ENGINE_SHADOW_POLICY,
): ColdEngineLoadCluster[] {
  if (samples.length < policy.minClusterSamples) return [];

  const sorted = [...samples].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const clusters: ColdEngineLoadCluster[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const kind = classifyHighLoadKind(sorted[i], policy);
    if (!kind) continue;

    const start = i;
    while (i < sorted.length - 1) {
      const gap = new Date(sorted[i + 1].timestamp).getTime() - new Date(sorted[i].timestamp).getTime();
      if (gap > policy.clusterMaxGapMs) break;
      if (!continuesCluster(sorted[i + 1], kind, policy)) break;
      i += 1;
    }

    const slice = sorted.slice(start, i + 1);
    const startedAt = slice[0].timestamp;
    const endedAt = slice[slice.length - 1].timestamp;
    const durationMs =
      new Date(endedAt).getTime() - new Date(startedAt).getTime();

    if (slice.length < policy.minClusterSamples || durationMs < minDurationForKind(kind, policy)) {
      continue;
    }

    const coolantValues = slice
      .map((s) => s.coolantC)
      .filter((v): v is number => v != null);
    const { peakValue, peakUnit } = peakValueForKind(slice, kind, policy);
    const peakSample = slice.reduce((best, current) => {
      const currentPeak =
        kind === 'COLD_ENGINE_HIGH_RPM'
          ? current.rpm ?? 0
          : kind === 'COLD_ENGINE_FULL_THROTTLE'
            ? current.throttlePct ?? 0
            : Math.max(current.loadPct ?? 0, current.torquePct ?? 0);
      const bestPeak =
        kind === 'COLD_ENGINE_HIGH_RPM'
          ? best.rpm ?? 0
          : kind === 'COLD_ENGINE_FULL_THROTTLE'
            ? best.throttlePct ?? 0
            : Math.max(best.loadPct ?? 0, best.torquePct ?? 0);
      return currentPeak > bestPeak ? current : best;
    }, slice[0]);

    clusters.push({
      kind,
      startedAt,
      endedAt,
      durationMs,
      peakAt: peakSample.timestamp,
      peakValue,
      peakUnit,
      maxCoolantC: coolantValues.length ? Math.max(...coolantValues) : 0,
      sampleCount: slice.length,
      severity: severityForCluster(kind, peakValue, policy),
    });
  }

  return clusters;
}

export function clustersToCandidateEvents(
  clusters: readonly ColdEngineLoadCluster[],
): ShadowCandidateEvent[] {
  return clusters.map((cluster) => ({
    eventType: cluster.kind,
    occurredAt: cluster.peakAt,
    severity: cluster.severity,
    peakValue: cluster.peakValue,
    unit: cluster.peakUnit,
    label: 'shadow_candidate',
  }));
}

export function buildColdEngineShadowConfidence(input: {
  coverage: number | null;
  clusterCount: number;
  coolantSampleCount: number;
  totalSamples: number;
}): number | null {
  if (input.totalSamples === 0) return null;
  const coolantRatio = input.coolantSampleCount / input.totalSamples;
  const coverageFactor = input.coverage ?? 0.5;
  const clusterFactor = Math.min(1, input.clusterCount / 3);
  const raw = coolantRatio * 0.5 + coverageFactor * 0.35 + clusterFactor * 0.15;
  return Math.round(Math.min(1, Math.max(0, raw)) * 100) / 100;
}
