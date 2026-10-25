import type {
  DiV0MotionCoreShadowTripMapReadResponse,
  DiV0MotionCoreShadowTripMapSampleDto,
  DiV0MotionCoreShadowTripMapStopDto,
} from '../../driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-trip-map-read.types';
import type {
  TireDs4ShadowTemporalCoverage,
  TireDs4ShadowTemporalCoverageDetail,
} from './tire-ds4-shadow.types';

export type TireDs4ShadowTripWindowContext = {
  tripDistanceKm: number;
  tripStartedAt: Date | string | null;
  tripEndedAt: Date | string | null;
};

function toMs(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function bucketSecondKey(labelUtc: string): number | null {
  const ms = Date.parse(labelUtc);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000);
}

function isSampleEvidenceOk(sample: DiV0MotionCoreShadowTripMapSampleDto): boolean {
  const q = sample.evidenceQuality.trim().toUpperCase();
  return q === 'OK' || q === 'DEGRADED';
}

function isStopEvidenceOk(stop: DiV0MotionCoreShadowTripMapStopDto): boolean {
  const q = stop.evidenceQuality.trim().toUpperCase();
  return q === 'OK' || q === 'DEGRADED';
}

export function computeTemporalCoverage(
  read: DiV0MotionCoreShadowTripMapReadResponse,
  trip: TireDs4ShadowTripWindowContext,
): { temporalCoverage: TireDs4ShadowTemporalCoverage; detail: TireDs4ShadowTemporalCoverageDetail } {
  const sampleKeys = new Set<number>();
  const drivingKeys = new Set<number>();
  const stationaryKeys = new Set<number>();
  const gapKeys = new Set<number>();

  const samples = read.samples ?? [];
  const stopEpisodes = read.stopEpisodes ?? [];

  for (const sample of samples) {
    const key = bucketSecondKey(sample.bucketLabelUtc);
    if (key == null) continue;
    sampleKeys.add(key);
    if (!isSampleEvidenceOk(sample)) {
      gapKeys.add(key);
      continue;
    }
    if (sample.speedKmh != null && Number.isFinite(sample.speedKmh) && sample.speedKmh > 0.5) {
      drivingKeys.add(key);
    }
  }

  const tripStartMs = toMs(trip.tripStartedAt);
  const tripEndMs = toMs(trip.tripEndedAt);
  let windowStartMs = tripStartMs;
  let windowEndMs = tripEndMs;

  if (samples.length > 0) {
    const sampleMs = samples
      .map((s) => Date.parse(s.bucketLabelUtc))
      .filter((ms) => Number.isFinite(ms));
    if (sampleMs.length > 0) {
      const minS = Math.min(...sampleMs);
      const maxS = Math.max(...sampleMs);
      windowStartMs = windowStartMs ?? minS;
      windowEndMs = windowEndMs ?? maxS;
    }
  }

  if (windowStartMs == null || windowEndMs == null || windowEndMs <= windowStartMs) {
    return {
      temporalCoverage: sampleKeys.size > 0 ? 'PARTIAL' : 'NONE',
      detail: {
        tripWindowSeconds: 0,
        labelledSampleSeconds: sampleKeys.size,
        validDrivingSeconds: drivingKeys.size,
        confirmedStationarySeconds: 0,
        gapSeconds: gapKeys.size,
        unknownSeconds: 0,
        labelledFraction: null,
        fableHypothesis85PctThreshold: 0.85,
        verified: false,
      },
    };
  }

  const tripWindowSeconds = Math.max(1, Math.round((windowEndMs - windowStartMs) / 1000) + 1);

  for (const stop of stopEpisodes) {
    if (!stop.observed || !isStopEvidenceOk(stop)) continue;
    const startMs = Date.parse(stop.startEarliestUtc);
    const endMs = stop.endEarliestUtc ? Date.parse(stop.endEarliestUtc) : startMs;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    const lo = Math.max(windowStartMs, Math.min(startMs, endMs));
    const hi = Math.min(windowEndMs, Math.max(startMs, endMs));
    for (let t = Math.floor(lo / 1000); t <= Math.floor(hi / 1000); t += 1) {
      if (!drivingKeys.has(t)) stationaryKeys.add(t);
    }
  }

  const accounted = new Set<number>();
  for (const k of sampleKeys) accounted.add(k);
  for (const k of stationaryKeys) accounted.add(k);

  const sortedSamples = [...sampleKeys].sort((a, b) => a - b);
  let internalGapSeconds = 0;
  for (let i = 1; i < sortedSamples.length; i += 1) {
    const delta = sortedSamples[i]! - sortedSamples[i - 1]!;
    if (delta > 1) internalGapSeconds += delta - 1;
  }

  const windowStartSec = Math.floor(windowStartMs / 1000);
  const windowEndSec = Math.floor(windowEndMs / 1000);
  let unknownSeconds = 0;
  for (let t = windowStartSec; t <= windowEndSec; t += 1) {
    if (!accounted.has(t)) unknownSeconds += 1;
  }

  const labelledSampleSeconds = sampleKeys.size;
  const confirmedStationarySeconds = stationaryKeys.size;
  const gapSeconds = internalGapSeconds + gapKeys.size;
  const labelledFraction = labelledSampleSeconds / tripWindowSeconds;

  const ledgerAligned =
    tripStartMs != null &&
    tripEndMs != null &&
    sampleKeys.size > 0 &&
    Math.abs(Math.min(...sampleKeys) * 1000 - tripStartMs) <= 2000 &&
    Math.abs(Math.max(...sampleKeys) * 1000 - tripEndMs) <= 2000;

  const verified =
    ledgerAligned &&
    unknownSeconds === 0 &&
    internalGapSeconds === 0 &&
    labelledSampleSeconds >= tripWindowSeconds;

  let temporalCoverage: TireDs4ShadowTemporalCoverage = 'UNVERIFIED';
  if (sampleKeys.size === 0 && stationaryKeys.size === 0) {
    temporalCoverage = 'NONE';
  } else if (verified) {
    temporalCoverage = 'VERIFIED';
  } else if (labelledSampleSeconds > 0 || confirmedStationarySeconds > 0) {
    temporalCoverage = 'PARTIAL';
  }

  return {
    temporalCoverage,
    detail: {
      tripWindowSeconds,
      labelledSampleSeconds,
      validDrivingSeconds: drivingKeys.size,
      confirmedStationarySeconds,
      gapSeconds,
      unknownSeconds,
      labelledFraction,
      fableHypothesis85PctThreshold: 0.85,
      verified,
    },
  };
}
