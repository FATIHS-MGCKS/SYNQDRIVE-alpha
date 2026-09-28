import type { RawFuelSignalSample } from '../../raw-fuel-rise-detector/raw-fuel-signal-sample.types';
import { sampleAt, stablePlateauSamples } from '../../raw-fuel-rise-detector/testing/raw-fuel-rise-detector-test.util';

/** KS MX 2024 — production-shaped stale pre-fill defect (2026-09-16). */
export const KS_MX_2026_09_16_VEHICLE_ID = 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63';

/** Immediate pre-fill before Esso rise ≈5 L (native authority). */
export const KS_MX_2026_09_16_TRUE_PRE_FILL_L = 5;
export const KS_MX_2026_09_16_POST_FILL_L = 27;
export const KS_MX_2026_09_16_TRUE_DELTA_L = 22;

/**
 * Stale 10 L plateau (hours before fill), actual state drops to ~5 L, then rise to 27 L.
 * Produces false 17 L delta if stale baseline is reused.
 */
export function buildKsMx20260916StalePre10Samples(): RawFuelSignalSample[] {
  const stalePre = stablePlateauSamples('2026-09-16T11:42:00.008Z', 10, 4, 120);
  const actualPre = stablePlateauSamples('2026-09-16T20:46:00.008Z', 5, 4, 60);
  const rise = [
    sampleAt('2026-09-16T20:52:30.008Z', 12),
    sampleAt('2026-09-16T20:53:00.008Z', 18),
    sampleAt('2026-09-16T20:53:30.008Z', 22),
  ];
  const post = stablePlateauSamples('2026-09-16T20:54:00.008Z', 27, 5, 60);
  return [...stalePre, ...actualPre, ...rise, ...post];
}

export function buildKsMx20260916StalePre17Samples(): RawFuelSignalSample[] {
  const stalePre = stablePlateauSamples('2026-09-16T12:00:00.008Z', 17, 4, 120);
  const actualPre = stablePlateauSamples('2026-09-16T20:46:00.008Z', 5, 4, 60);
  const rise = [
    sampleAt('2026-09-16T20:52:30.008Z', 12),
    sampleAt('2026-09-16T20:53:00.008Z', 22),
    sampleAt('2026-09-16T20:53:30.008Z', 25),
  ];
  const post = stablePlateauSamples('2026-09-16T20:54:00.008Z', 27, 5, 60);
  return [...stalePre, ...actualPre, ...rise, ...post];
}

export function buildKsMx20260916StalePre14Samples(): RawFuelSignalSample[] {
  const stalePre = stablePlateauSamples('2026-09-16T12:30:00.008Z', 14, 4, 120);
  const actualPre = stablePlateauSamples('2026-09-16T20:46:00.008Z', 5, 4, 60);
  const rise = [
    sampleAt('2026-09-16T20:52:30.008Z', 15),
    sampleAt('2026-09-16T20:53:00.008Z', 22),
    sampleAt('2026-09-16T20:53:30.008Z', 26),
  ];
  const post = stablePlateauSamples('2026-09-16T20:54:00.008Z', 27, 5, 60);
  return [...stalePre, ...actualPre, ...rise, ...post];
}

/** Fresh ~5 L pre plateau immediately before material rise (expected post-fix). */
export function buildKsMx20260916FreshPre5Samples(): RawFuelSignalSample[] {
  const freshPre = stablePlateauSamples('2026-09-16T20:46:00.008Z', 5, 4, 60);
  const rise = [
    sampleAt('2026-09-16T20:52:30.008Z', 12),
    sampleAt('2026-09-16T20:53:00.008Z', 18),
    sampleAt('2026-09-16T20:53:30.008Z', 22),
  ];
  const post = stablePlateauSamples('2026-09-16T20:54:00.008Z', 27, 5, 60);
  return [...freshPre, ...rise, ...post];
}

export const KS_MX_STALE_PRE10_DEFECT = {
  PRE_PLATEAU_VALUE: 10,
  PRE_PLATEAU_END_AT: '2026-09-16T11:46:00.008Z',
  RISE_ONSET_AT: '2026-09-16T20:52:30.008Z',
  POST_VALUE: 27,
  DETECTED_DELTA_STALE: 17,
} as const;
