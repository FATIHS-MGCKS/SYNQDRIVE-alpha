import type {
  DiV0MotionCoreShadowTripMapReadResponse,
  DiV0MotionCoreShadowTripMapSampleDto,
  DiV0MotionCoreShadowTripMapStopDto,
} from '../../driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-trip-map-read.types';
import {
  classifyLegacySampleQuality,
  isAccountableFsmDrivingSecond,
  isAccountableFsmStationarySecond,
  isEligibleFsmStopEpisode,
  isMotionFsmEvidenceQualityToken,
  normalizeMotionFsmEvidenceQuality,
} from './tire-ds4-shadow-fsm-temporal-quality';
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

function isValidLegacyOkDrivingSample(sample: DiV0MotionCoreShadowTripMapSampleDto): boolean {
  if (classifyLegacySampleQuality(sample.evidenceQuality) !== 'OK') return false;
  if (sample.speedKmh == null || !isPlausibleSpeedKmh(sample.speedKmh)) return false;
  return sample.speedKmh > MIN_MOVING_SPEED_KMH;
}

function isEligibleLegacyStopEpisode(stop: DiV0MotionCoreShadowTripMapStopDto): boolean {
  if (!stop.observed || stop.inferred) return false;
  if (classifyLegacySampleQuality(stop.evidenceQuality) !== 'OK') return false;
  if (!stop.endEarliestUtc || !stop.endLatestUtc) return false;
  const startLatestMs = Date.parse(stop.startLatestUtc);
  const endEarliestMs = Date.parse(stop.endEarliestUtc);
  if (!Number.isFinite(startLatestMs) || !Number.isFinite(endEarliestMs) || endEarliestMs < startLatestMs) {
    return false;
  }
  return true;
}

function isEligibleStopEpisode(
  stop: DiV0MotionCoreShadowTripMapStopDto,
): boolean {
  if (isMotionFsmEvidenceQualityToken(stop.evidenceQuality)) {
    return isEligibleFsmStopEpisode(stop);
  }
  return isEligibleLegacyStopEpisode(stop);
}

/** FSM: startEarliest/startLatest and endEarliest/endLatest bracket uncertainty; only tight bounds allow gapless imputation. */
function stopBoundariesAreCertain(stop: DiV0MotionCoreShadowTripMapStopDto): boolean {
  const startEarliestSec = bucketSecondKey(stop.startEarliestUtc);
  const startLatestSec = bucketSecondKey(stop.startLatestUtc);
  if (startEarliestSec == null || startLatestSec == null || startEarliestSec !== startLatestSec) {
    return false;
  }
  const endEarliestSec = bucketSecondKey(stop.endEarliestUtc!);
  const endLatestSec = bucketSecondKey(stop.endLatestUtc!);
  if (endEarliestSec == null || endLatestSec == null || endEarliestSec !== endLatestSec) {
    return false;
  }
  return true;
}

function isOkStationarySample(
  sample: DiV0MotionCoreShadowTripMapSampleDto,
  speedAuthority: DiV0MotionCoreShadowTripMapReadResponse['speedAuthority'],
): boolean {
  if (isMotionFsmEvidenceQualityToken(sample.evidenceQuality)) {
    return isAccountableFsmStationarySecond(sample, speedAuthority, MIN_MOVING_SPEED_KMH);
  }
  if (classifyLegacySampleQuality(sample.evidenceQuality) !== 'OK') return false;
  if (sample.speedKmh == null || !isPlausibleSpeedKmh(sample.speedKmh)) return true;
  return sample.speedKmh <= MIN_MOVING_SPEED_KMH;
}

function stopCoreBoundsSec(
  stop: DiV0MotionCoreShadowTripMapStopDto,
  windowStartSec: number,
  windowEndSec: number,
): { loSec: number; hiSec: number } | null {
  if (!isEligibleStopEpisode(stop)) return null;
  const loSec = Math.max(windowStartSec, bucketSecondKey(stop.startLatestUtc)!);
  const hiSec = Math.min(windowEndSec, bucketSecondKey(stop.endEarliestUtc!)!);
  if (hiSec < loSec) return null;
  return { loSec, hiSec };
}

function canImputeStationarySecondsWithoutSamples(
  stop: DiV0MotionCoreShadowTripMapStopDto,
  loSec: number,
  hiSec: number,
): boolean {
  if (stop.gapLabels > 0) return false;
  if (!stopBoundariesAreCertain(stop)) return false;
  const spanSeconds = hiSec - loSec + 1;
  return stop.observedLabels >= spanSeconds;
}

function addConfirmedStationarySecondsFromStop(
  stop: DiV0MotionCoreShadowTripMapStopDto,
  windowStartSec: number,
  windowEndSec: number,
  sampleBySecond: Map<number, DiV0MotionCoreShadowTripMapSampleDto>,
  confirmedStationaryBySecond: Set<number>,
  speedAuthority: DiV0MotionCoreShadowTripMapReadResponse['speedAuthority'],
): void {
  const bounds = stopCoreBoundsSec(stop, windowStartSec, windowEndSec);
  if (!bounds) return;
  const imputeAll = canImputeStationarySecondsWithoutSamples(stop, bounds.loSec, bounds.hiSec);
  for (let t = bounds.loSec; t <= bounds.hiSec; t += 1) {
    const sample = sampleBySecond.get(t);
    if (sample != null) {
      if (isOkStationarySample(sample, speedAuthority)) {
        confirmedStationaryBySecond.add(t);
      }
      continue;
    }
    if (imputeAll) {
      confirmedStationaryBySecond.add(t);
    }
  }
}

function classifyLabelledSecond(
  sample: DiV0MotionCoreShadowTripMapSampleDto,
  speedAuthority: DiV0MotionCoreShadowTripMapReadResponse['speedAuthority'],
  confirmedStop: boolean,
): 'valid_driving' | 'confirmed_stationary' | 'degraded' | 'invalid' {
  if (isMotionFsmEvidenceQualityToken(sample.evidenceQuality)) {
    if (isAccountableFsmDrivingSecond(sample, speedAuthority, MIN_MOVING_SPEED_KMH)) {
      return 'valid_driving';
    }
    const fsmQ = normalizeMotionFsmEvidenceQuality(sample.evidenceQuality);
    if (fsmQ === 'INFERRED') return 'degraded';
    if (fsmQ === 'INDETERMINATE') return 'invalid';
    if (fsmQ === 'DIRECT' && confirmedStop && isOkStationarySample(sample, speedAuthority)) {
      return 'confirmed_stationary';
    }
    return 'invalid';
  }

  if (isValidLegacyOkDrivingSample(sample)) return 'valid_driving';
  const legacyQ = classifyLegacySampleQuality(sample.evidenceQuality);
  if (legacyQ === 'DEGRADED') return 'degraded';
  if (legacyQ === 'OK' && confirmedStop && isOkStationarySample(sample, speedAuthority)) {
    return 'confirmed_stationary';
  }
  return 'invalid';
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
  const speedAuthority = read.speedAuthority;

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
    addConfirmedStationarySecondsFromStop(
      stop,
      windowStartSec,
      windowEndSec,
      sampleBySecond,
      confirmedStationaryBySecond,
      speedAuthority,
    );
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
      const bucket = classifyLabelledSecond(sample, speedAuthority, confirmedStop);
      if (bucket === 'valid_driving') {
        validDrivingSeconds += 1;
        continue;
      }
      if (bucket === 'degraded') {
        degradedLabelSeconds += 1;
        continue;
      }
      if (bucket === 'confirmed_stationary') {
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
