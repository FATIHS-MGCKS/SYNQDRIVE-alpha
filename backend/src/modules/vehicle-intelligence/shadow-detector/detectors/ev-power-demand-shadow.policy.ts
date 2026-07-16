/**
 * Versioned policy for BEV high power demand shadow detector (P40).
 */
import {
  DETECTOR_CADENCE_SHADOW_MAX_MS,
  DETECTOR_MIN_COVERAGE_SHADOW,
} from '../../driving-detector-capability/driving-detector-capability.registry';
import type {
  ShadowCandidateEvent,
  ShadowDetectorHfSample,
} from '../shadow-detector.types';

export const EV_POWER_DEMAND_SHADOW_POLICY_VERSION = 'ev-power-demand-shadow-v1';

export const EV_POWER_DEMAND_SHADOW_POLICY = {
  version: EV_POWER_DEMAND_SHADOW_POLICY_VERSION,
  minSustainedDurationMs: 12_000,
  clusterMaxGapMs: 5_000,
  minClusterSamples: 4,
  highDemandKw: 70,
  continuationDemandKw: 50,
  minAccelerationDeltaKmh: 2,
  minSignInferenceSamples: 3,
  signMagnitudeKw: 5,
  highwaySpeedMinKmh: 80,
  rampStartSpeedMaxKmh: 45,
  rampEndSpeedMinKmh: 65,
  uphillAltitudeGainM: 12,
  uphillConfidenceReduction: 0.25,
  rampConfidenceReduction: 0.2,
  ambiguousConventionConfidenceReduction: 0.3,
  maxEffectiveCadenceMs: DETECTOR_CADENCE_SHADOW_MAX_MS,
  minCoverage: DETECTOR_MIN_COVERAGE_SHADOW,
  minHfSamples: 8,
} as const;

export type EvPowerDemandShadowPolicy = typeof EV_POWER_DEMAND_SHADOW_POLICY;

export type EvPowerSignConvention =
  | 'NEGATIVE_IS_DISCHARGE'
  | 'POSITIVE_IS_DISCHARGE'
  | 'AMBIGUOUS'
  | 'UNKNOWN';

export type EvHighPowerDemandCluster = {
  startedAt: string;
  endedAt: string;
  durationMs: number;
  peakAt: string;
  peakDemandKw: number;
  avgDemandKw: number;
  avgSpeedKmh: number | null;
  startSpeedKmh: number | null;
  endSpeedKmh: number | null;
  avgSocPct: number | null;
  avgExteriorTempC: number | null;
  avgBatteryTempC: number | null;
  altitudeGainM: number | null;
  uphillContext: boolean;
  highwayContext: boolean;
  rampContext: boolean;
  signConvention: EvPowerSignConvention;
  sampleCount: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  confidenceFactor: number;
};

function sortedSamples(samples: readonly ShadowDetectorHfSample[]): ShadowDetectorHfSample[] {
  return [...samples].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

/**
 * Infer discharge sign convention empirically from acceleration windows.
 * DIMO canonical: negative = motoring — but vehicles may differ.
 */
export function inferEvPowerSignConvention(
  samples: readonly ShadowDetectorHfSample[],
  policy: EvPowerDemandShadowPolicy = EV_POWER_DEMAND_SHADOW_POLICY,
): EvPowerSignConvention {
  const sorted = sortedSamples(samples);
  const acceleratingPower: number[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev.speedKmh == null || cur.speedKmh == null) continue;
    if (cur.speedKmh - prev.speedKmh < policy.minAccelerationDeltaKmh) continue;
    if (cur.tractionBatteryPowerKw == null) continue;
    acceleratingPower.push(cur.tractionBatteryPowerKw);
  }

  if (acceleratingPower.length < policy.minSignInferenceSamples) {
    return 'UNKNOWN';
  }

  const negativeCount = acceleratingPower.filter(
    (p) => p <= -policy.signMagnitudeKw,
  ).length;
  const positiveCount = acceleratingPower.filter(
    (p) => p >= policy.signMagnitudeKw,
  ).length;

  if (
    negativeCount >= policy.minSignInferenceSamples &&
    negativeCount >= positiveCount * 1.5
  ) {
    return 'NEGATIVE_IS_DISCHARGE';
  }
  if (
    positiveCount >= policy.minSignInferenceSamples &&
    positiveCount >= negativeCount * 1.5
  ) {
    return 'POSITIVE_IS_DISCHARGE';
  }
  return 'AMBIGUOUS';
}

export function toDemandKw(
  powerKw: number,
  convention: EvPowerSignConvention,
): number {
  if (convention === 'NEGATIVE_IS_DISCHARGE') {
    return powerKw < 0 ? Math.abs(powerKw) : 0;
  }
  if (convention === 'POSITIVE_IS_DISCHARGE') {
    return powerKw > 0 ? powerKw : 0;
  }
  // Unknown/ambiguous: prefer DIMO canonical discharge sign, ignore regen magnitudes
  return powerKw < 0 ? Math.abs(powerKw) : 0;
}

function isHighDemandPoint(
  sample: ShadowDetectorHfSample,
  convention: EvPowerSignConvention,
  policy: EvPowerDemandShadowPolicy,
): boolean {
  if (sample.tractionBatteryPowerKw == null) return false;
  return toDemandKw(sample.tractionBatteryPowerKw, convention) >= policy.highDemandKw;
}

function continuesHighDemand(
  sample: ShadowDetectorHfSample,
  convention: EvPowerSignConvention,
  policy: EvPowerDemandShadowPolicy,
): boolean {
  if (sample.tractionBatteryPowerKw == null) return false;
  return toDemandKw(sample.tractionBatteryPowerKw, convention) >= policy.continuationDemandKw;
}

function avgOf(
  slice: readonly ShadowDetectorHfSample[],
  pick: (s: ShadowDetectorHfSample) => number | null,
): number | null {
  const values = slice.map(pick).filter((v): v is number => v != null);
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function altitudeGainM(slice: readonly ShadowDetectorHfSample[]): number | null {
  const values = slice.map((s) => s.altitudeM).filter((v): v is number => v != null);
  if (values.length < 2) return null;
  return Math.max(...values) - Math.min(...values);
}

function confidenceFactorForCluster(
  cluster: Omit<EvHighPowerDemandCluster, 'severity' | 'confidenceFactor'>,
  policy: EvPowerDemandShadowPolicy,
): number {
  let factor = 1;
  if (cluster.signConvention === 'AMBIGUOUS' || cluster.signConvention === 'UNKNOWN') {
    factor -= policy.ambiguousConventionConfidenceReduction;
  }
  if (cluster.uphillContext) {
    factor -= policy.uphillConfidenceReduction;
  }
  if (cluster.rampContext) {
    factor -= policy.rampConfidenceReduction;
  }
  if (cluster.highwayContext && !cluster.uphillContext) {
    factor = Math.min(1, factor + 0.05);
  }
  return Math.round(Math.max(0.15, Math.min(1, factor)) * 100) / 100;
}

function severityForCluster(
  peakDemandKw: number,
  durationMs: number,
  policy: EvPowerDemandShadowPolicy,
): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (peakDemandKw >= policy.highDemandKw * 1.4 && durationMs >= policy.minSustainedDurationMs * 1.5) {
    return 'HIGH';
  }
  if (peakDemandKw >= policy.highDemandKw && durationMs >= policy.minSustainedDurationMs) {
    return 'MEDIUM';
  }
  return 'LOW';
}

export function detectEvHighPowerDemandClusters(
  samples: readonly ShadowDetectorHfSample[],
  policy: EvPowerDemandShadowPolicy = EV_POWER_DEMAND_SHADOW_POLICY,
): EvHighPowerDemandCluster[] {
  if (samples.length < policy.minClusterSamples) return [];

  const signConvention = inferEvPowerSignConvention(samples, policy);
  const sorted = sortedSamples(samples);
  const clusters: EvHighPowerDemandCluster[] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (!isHighDemandPoint(sorted[i], signConvention, policy)) continue;

    const start = i;
    while (i < sorted.length - 1) {
      const gap =
        new Date(sorted[i + 1].timestamp).getTime() -
        new Date(sorted[i].timestamp).getTime();
      if (gap > policy.clusterMaxGapMs) break;
      if (!continuesHighDemand(sorted[i + 1], signConvention, policy)) break;
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

    const demandValues = slice
      .map((s) =>
        s.tractionBatteryPowerKw != null
          ? toDemandKw(s.tractionBatteryPowerKw, signConvention)
          : null,
      )
      .filter((v): v is number => v != null && v > 0);

    if (!demandValues.length) continue;

    const peakDemandKw = Math.max(...demandValues);
    const peakSample = slice.reduce((best, current) => {
      const bestDemand =
        best.tractionBatteryPowerKw != null
          ? toDemandKw(best.tractionBatteryPowerKw, signConvention)
          : 0;
      const curDemand =
        current.tractionBatteryPowerKw != null
          ? toDemandKw(current.tractionBatteryPowerKw, signConvention)
          : 0;
      return curDemand > bestDemand ? current : best;
    });

    const avgSpeed = avgOf(slice, (s) => s.speedKmh);
    const startSpeed = slice[0].speedKmh;
    const endSpeed = slice[slice.length - 1].speedKmh;
    const gainM = altitudeGainM(slice);
    const uphillContext = gainM != null && gainM >= policy.uphillAltitudeGainM;
    const highwayContext =
      avgSpeed != null && avgSpeed >= policy.highwaySpeedMinKmh;
    const rampContext =
      startSpeed != null &&
      endSpeed != null &&
      startSpeed <= policy.rampStartSpeedMaxKmh &&
      endSpeed >= policy.rampEndSpeedMinKmh &&
      endSpeed > startSpeed + 15;

    const base: Omit<EvHighPowerDemandCluster, 'severity' | 'confidenceFactor'> = {
      startedAt,
      endedAt,
      durationMs,
      peakAt: peakSample.timestamp,
      peakDemandKw,
      avgDemandKw:
        demandValues.reduce((sum, v) => sum + v, 0) / demandValues.length,
      avgSpeedKmh: avgSpeed,
      startSpeedKmh: startSpeed,
      endSpeedKmh: endSpeed,
      avgSocPct: avgOf(slice, (s) => s.socPct),
      avgExteriorTempC: avgOf(slice, (s) => s.exteriorTempC),
      avgBatteryTempC: avgOf(slice, (s) => s.tractionBatteryTemperatureC),
      altitudeGainM: gainM,
      uphillContext,
      highwayContext,
      rampContext,
      signConvention,
      sampleCount: slice.length,
    };

    clusters.push({
      ...base,
      severity: severityForCluster(peakDemandKw, durationMs, policy),
      confidenceFactor: confidenceFactorForCluster(base, policy),
    });
  }

  return clusters;
}

export function clustersToCandidateEvents(
  clusters: readonly EvHighPowerDemandCluster[],
): ShadowCandidateEvent[] {
  return clusters.map((cluster) => ({
    eventType: 'HIGH_EV_POWER_DEMAND',
    occurredAt: cluster.peakAt,
    severity: cluster.severity,
    peakValue: Math.round(cluster.peakDemandKw * 10) / 10,
    unit: 'kW',
    label: 'shadow_candidate',
  }));
}

export function summarizeClustersForContext(
  clusters: readonly EvHighPowerDemandCluster[],
): string {
  return JSON.stringify(
    clusters.slice(0, 5).map((c) => ({
      start: c.startedAt,
      end: c.endedAt,
      durationMs: c.durationMs,
      peakDemandKw: c.peakDemandKw,
      signConvention: c.signConvention,
      uphill: c.uphillContext,
      ramp: c.rampContext,
      highway: c.highwayContext,
      avgSocPct: c.avgSocPct,
    })),
  );
}

export function buildEvPowerDemandConfidence(input: {
  coverage: number | null;
  clusters: readonly EvHighPowerDemandCluster[];
  signConvention: EvPowerSignConvention;
}): number | null {
  if (!input.clusters.length) return null;
  const avgClusterFactor =
    input.clusters.reduce((sum, c) => sum + c.confidenceFactor, 0) /
    input.clusters.length;
  const coverageFactor = input.coverage ?? 0.5;
  let raw = avgClusterFactor * 0.65 + coverageFactor * 0.35;
  if (input.signConvention === 'UNKNOWN') {
    raw *= 0.85;
  }
  return Math.round(Math.max(0, Math.min(1, raw)) * 100) / 100;
}
