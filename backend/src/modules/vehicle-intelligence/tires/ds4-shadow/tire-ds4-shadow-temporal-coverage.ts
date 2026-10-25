import type {
  DiV0MotionCoreShadowTripMapReadResponse,
  DiV0MotionCoreShadowTripMapSampleDto,
  DiV0MotionCoreShadowTripMapStopDto,
} from '../../driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-trip-map-read.types';
import { isPlausibleSpeedKmh } from './tire-ds4-shadow-m3-dynamics';
import type {
  TireDs4ShadowTemporalCoverage,
  TireDs4ShadowTemporalCoverageDetail,
} from './tire-ds4-shadow.types';

export type TireDs4ShadowTripWindowContext = {
  tripDistanceKm: number;
  tripStartedAt: Date | string | null;
  tripEndedAt: Date | string | null;
};

const MIN_MOVING_SPEED_KMH = 0.5;

type SampleQualityClass = 'OK' | 'DEGRADED' | 'LIMITED' | 'ARTEFACT' | 'OTHER';

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

function classifySampleQuality(sample: DiV0MotionCoreShadowTripMapSampleDto): SampleQualityClass {
  const q = sample.evidenceQuality.trim().toUpperCase();
  if (q === 'OK') return 'OK';
  if (q === 'DEGRADED') return 'DEGRADED';
  if (q === 'LIMITED') return 'LIMITED';
  if (q === 'ARTEFACT_SUSPECT' || q === 'ARTEFACT') return 'ARTEFACT';
  return 'OTHER';
}

function isValidOkDrivingSample(sample: DiV0MotionCoreShadowTripMapSampleDto): boolean {
  if (classifySampleQuality(sample) !== 'OK') return false;
  if (sample.speedKmh == null || !isPlausibleSpeedKmh(sample.speedKmh)) return false;
  return sample.speedKmh > MIN_MOVING_SPEED_KMH;
}

function isDirectlyConfirmedStop(stop: DiV0MotionCoreShadowTripMapStopDto): boolean {
  if (!stop.observed || stop.inferred) return false;
  if (stop.gapLabels > 0) return false;
  if (classifySampleQuality({ evidenceQuality: stop.evidenceQuality } as DiV0MotionCoreShadowTripMapSampleDto) !== 'OK') {
    return false;
  }
  const endUtc = stop.endEarliestUtc;
  if (!endUtc || !stop.endLatestUtc) return false;
  const startMs = Date.parse(stop.startEarliestUtc);
  const endMs = Date.parse(endUtc);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return false;
  return true;
}

function emptyDetail(): TireDs4ShadowTemporalCoverageDetail {
  return {
    tripWindowSeconds: 0,
    labelledSampleSeconds: 0,
    validDrivingSeconds: 0,
    confirmedStationarySeconds: 0,
    degradedLabelSeconds: 0,
    invalidLabelSeconds: 0,
    gapSeconds: 0,
    unknownSeconds: 0,
    labelledFraction: null,
    accountableFraction: null,
    fableHypothesis85PctThreshold: 0.85,
    verified: false,
  };
}

export function computeTemporalCoverage(
  read: DiV0MotionCoreShadowTripMapReadResponse,
  trip: TireDs4ShadowTripWindowContext,
): { temporalCoverage: TireDs4ShadowTemporalCoverage; detail: TireDs4ShadowTemporalCoverageDetail } {
  const samples = read.samples ?? [];
  const stopEpisodes = read.stopEpisodes ?? [];

  const tripStartMs = toMs(trip.tripStartedAt);
  const tripEndMs = toMs(trip.tripEndedAt);

  if (tripStartMs == null || tripEndMs == null || tripEndMs <= tripStartMs) {
    const detail = emptyDetail();
    const inWindowLabels = samples.filter((s) => {
      const k = bucketSecondKey(s.bucketLabelUtc);
      return k != null;
    }).length;
    detail.labelledSampleSeconds = inWindowLabels;
    return {
      temporalCoverage: inWindowLabels > 0 ? 'PARTIAL' : 'NONE',
      detail,
    };
  }

  const windowStartSec = Math.floor(tripStartMs / 1000);
  const windowEndSec = Math.floor(tripEndMs / 1000);
  const tripWindowSeconds = windowEndSec - windowStartSec + 1;

  const sampleBySecond = new Map<number, DiV0MotionCoreShadowTripMapSampleDto>();
  for (const sample of samples) {
    const key = bucketSecondKey(sample.bucketLabelUtc);
    if (key == null || key < windowStartSec || key > windowEndSec) continue;
    sampleBySecond.set(key, sample);
  }

  const confirmedStationaryBySecond = new Set<number>();
  for (const stop of stopEpisodes) {
    if (!isDirectlyConfirmedStop(stop)) continue;
    const startMs = Date.parse(stop.startEarliestUtc);
    const endUtc = stop.endEarliestUtc;
    if (!endUtc) continue;
    const endMs = Date.parse(endUtc);
    const loSec = Math.max(windowStartSec, Math.floor(Math.min(startMs, endMs) / 1000));
    const hiSec = Math.min(windowEndSec, Math.floor(Math.max(startMs, endMs) / 1000));
    for (let t = loSec; t <= hiSec; t += 1) {
      confirmedStationaryBySecond.add(t);
    }
  }

  let labelledSampleSeconds = 0;
  let validDrivingSeconds = 0;
  let confirmedStationarySeconds = 0;
  let degradedLabelSeconds = 0;
  let invalidLabelSeconds = 0;
  let unknownSeconds = 0;

  const labelledKeys: number[] = [];

  for (let t = windowStartSec; t <= windowEndSec; t += 1) {
    const sample = sampleBySecond.get(t);
    const confirmedStop = confirmedStationaryBySecond.has(t);

    if (sample) {
      labelledSampleSeconds += 1;
      labelledKeys.push(t);
      const q = classifySampleQuality(sample);
      if (isValidOkDrivingSample(sample)) {
        validDrivingSeconds += 1;
        continue;
      }
      if (q === 'DEGRADED') {
        degradedLabelSeconds += 1;
        continue;
      }
      if (q === 'OK' && confirmedStop) {
        confirmedStationarySeconds += 1;
        continue;
      }
      invalidLabelSeconds += 1;
      continue;
    }

    if (confirmedStop) {
      confirmedStationarySeconds += 1;
      continue;
    }

    unknownSeconds += 1;
  }

  let gapSeconds = 0;
  for (let i = 1; i < labelledKeys.length; i += 1) {
    const prev = labelledKeys[i - 1]!;
    const curr = labelledKeys[i]!;
    for (let t = prev + 1; t < curr; t += 1) {
      if (!confirmedStationaryBySecond.has(t)) {
        gapSeconds += 1;
      }
    }
  }

  const labelledFraction = Math.min(1, labelledSampleSeconds / tripWindowSeconds);
  const accountableSeconds = validDrivingSeconds + confirmedStationarySeconds;
  const accountableFraction = Math.min(1, accountableSeconds / tripWindowSeconds);

  const verified =
    tripWindowSeconds > 0 &&
    unknownSeconds === 0 &&
    gapSeconds === 0 &&
    degradedLabelSeconds === 0 &&
    invalidLabelSeconds === 0 &&
    accountableSeconds === tripWindowSeconds;

  let temporalCoverage: TireDs4ShadowTemporalCoverage = 'UNVERIFIED';
  if (labelledSampleSeconds === 0 && confirmedStationarySeconds === 0) {
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
      validDrivingSeconds,
      confirmedStationarySeconds,
      degradedLabelSeconds,
      invalidLabelSeconds,
      gapSeconds,
      unknownSeconds,
      labelledFraction,
      accountableFraction,
      fableHypothesis85PctThreshold: 0.85,
      verified,
    },
  };
}
