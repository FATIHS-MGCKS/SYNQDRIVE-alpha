/**
 * KS MS 661 — SYNTHETIC interpolated rise shape (RFRF F1.1).
 *
 * Explicitly NOT production-ground-truth. For algorithm/state-machine unit tests only.
 * Observed anchors imported from observed fixture; intermediate rise values are
 * linearly interpolated between audit-confirmed points.
 *
 * Do NOT use this file to claim production-incident detector proof.
 */
import {
  KS_MS_661_FIXTURE_ORGANIZATION_ID,
  KS_MS_661_FIXTURE_PROVENANCE,
  KS_MS_661_FIXTURE_TOKEN_ID,
  KS_MS_661_FIXTURE_VEHICLE_ID,
  KS_MS_661_OBSERVED_ABSOLUTE_FUEL_SAMPLES,
  KS_MS_661_OBSERVED_DETECTION_WINDOW,
  KS_MS_661_OBSERVED_FORECOURT_DWELL,
  KS_MS_661_OBSERVED_GROUND_TRUTH_UTC,
  KS_MS_661_OBSERVED_NATIVE_REFUEL_SEGMENTS,
} from './ks-ms-661-2026-09-06-refuel-observed.fixture';

export const KS_MS_661_SYNTHETIC_FIXTURE_KIND = 'SYNTHETIC_INTERPOLATED' as const;

export {
  KS_MS_661_FIXTURE_PROVENANCE,
  KS_MS_661_FIXTURE_VEHICLE_ID,
  KS_MS_661_FIXTURE_ORGANIZATION_ID,
  KS_MS_661_FIXTURE_TOKEN_ID,
  KS_MS_661_OBSERVED_GROUND_TRUTH_UTC as KS_MS_661_SYNTHETIC_GROUND_TRUTH_UTC,
  KS_MS_661_OBSERVED_DETECTION_WINDOW as KS_MS_661_SYNTHETIC_DETECTION_WINDOW,
  KS_MS_661_OBSERVED_NATIVE_REFUEL_SEGMENTS as KS_MS_661_SYNTHETIC_NATIVE_REFUEL_SEGMENTS,
  KS_MS_661_OBSERVED_FORECOURT_DWELL as KS_MS_661_SYNTHETIC_FORECOURT_DWELL,
};

/** SYNTHETIC — interpolated between observed anchors 16.4 L @ 09:39:30 and 31 L @ 09:43:00. */
export const KS_MS_661_SYNTHETIC_INTERPOLATED_RISE_SAMPLES: ReadonlyArray<{
  timestamp: string;
  absoluteLiters: number;
  relativePercent: null;
  evidence: 'SYNTHETIC_INTERPOLATED';
}> = [
  { timestamp: '2026-09-06T09:40:00.000Z', absoluteLiters: 20, relativePercent: null, evidence: 'SYNTHETIC_INTERPOLATED' },
  { timestamp: '2026-09-06T09:40:30.000Z', absoluteLiters: 24, relativePercent: null, evidence: 'SYNTHETIC_INTERPOLATED' },
  { timestamp: '2026-09-06T09:41:00.000Z', absoluteLiters: 27, relativePercent: null, evidence: 'SYNTHETIC_INTERPOLATED' },
  { timestamp: '2026-09-06T09:41:30.000Z', absoluteLiters: 29, relativePercent: null, evidence: 'SYNTHETIC_INTERPOLATED' },
  { timestamp: '2026-09-06T09:42:00.000Z', absoluteLiters: 30, relativePercent: null, evidence: 'SYNTHETIC_INTERPOLATED' },
  { timestamp: '2026-09-06T09:42:30.000Z', absoluteLiters: 30.5, relativePercent: null, evidence: 'SYNTHETIC_INTERPOLATED' },
];

/** Full synthetic series = observed plateau/rise anchors + interpolated mid-rise + post plateau. */
export const KS_MS_661_SYNTHETIC_ABSOLUTE_FUEL_SAMPLES = [
  ...KS_MS_661_OBSERVED_ABSOLUTE_FUEL_SAMPLES.filter(
    (s) => s.timestamp !== '2026-09-06T09:43:00.000Z' && s.timestamp !== '2026-09-06T09:47:00.000Z',
  ),
  ...KS_MS_661_SYNTHETIC_INTERPOLATED_RISE_SAMPLES,
  { timestamp: '2026-09-06T09:43:00.000Z', absoluteLiters: 31, relativePercent: null, evidence: 'AUDIT_CONFIRMED' as const },
  { timestamp: '2026-09-06T09:43:30.000Z', absoluteLiters: 31, relativePercent: null, evidence: 'SYNTHETIC_INTERPOLATED' as const },
  { timestamp: '2026-09-06T09:44:00.000Z', absoluteLiters: 31, relativePercent: null, evidence: 'SYNTHETIC_INTERPOLATED' as const },
  { timestamp: '2026-09-06T09:45:00.000Z', absoluteLiters: 31, relativePercent: null, evidence: 'SYNTHETIC_INTERPOLATED' as const },
  { timestamp: '2026-09-06T09:47:00.000Z', absoluteLiters: 31, relativePercent: null, evidence: 'AUDIT_CONFIRMED' as const },
];

/** F3 algorithm unit-test expectation on fully shaped synthetic series. */
export const KS_MS_661_SYNTHETIC_RFRF_EXPECTED = {
  rawRefuelCandidate: 'DETECTED',
  lifecycleState: 'READY_FOR_PERSIST',
  preFuelAbsoluteLiters: 7,
  postFuelAbsoluteLiters: 31,
  deltaLiters: 24,
} as const;
