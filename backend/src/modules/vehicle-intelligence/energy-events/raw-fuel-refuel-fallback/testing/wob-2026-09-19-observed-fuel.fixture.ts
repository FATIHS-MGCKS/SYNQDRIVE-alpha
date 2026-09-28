import type { RawFuelSignalSample } from '../../raw-fuel-rise-detector/raw-fuel-signal-sample.types';

function sampleAt(
  iso: string,
  absoluteLiters?: number | null,
  relativePercent?: number | null,
): RawFuelSignalSample {
  return {
    timestamp: new Date(iso),
    absoluteLiters,
    relativePercent,
  };
}

/**
 * Read-only Production DIMO historical extract — WOB L 7503 (tokenId 192922).
 * Window: 2026-09-19T15:30:00Z … 2026-09-19T17:10:00Z (15s bucket AVG).
 * Source: VPS read-only extract 2026-09-28 (not committed secrets).
 */
export const WOB_2026_09_19_OBSERVED_FILL = {
  LAST_VALID_PRE_FILL_SAMPLE_AT: '2026-09-19T16:07:45Z',
  LAST_VALID_PRE_FILL_ABSOLUTE_L: 4,
  LAST_VALID_PRE_FILL_RELATIVE_PERCENT: 8.627450980392156,
  FIRST_POST_FILL_OR_RISE_SAMPLE_AT: '2026-09-19T16:11:15Z',
  PRE_TO_RISE_GAP_SECONDS: 210,
} as const;

/** Material samples around physical fill (DIMO 15s aggregation). */
export const WOB_2026_09_19_OBSERVED_ABSOLUTE_FUEL_SAMPLES: RawFuelSignalSample[] = [
  sampleAt('2026-09-19T15:46:30Z', 5, 8.627450980392156),
  sampleAt('2026-09-19T15:46:45Z', 5, 8.627450980392156),
  sampleAt('2026-09-19T15:47:00Z', 5, 8.627450980392156),
  sampleAt('2026-09-19T15:47:15Z', 5, 8.627450980392156),
  sampleAt('2026-09-19T15:47:30Z', 5, 8.627450980392156),
  sampleAt('2026-09-19T15:47:45Z', 5, 8.627450980392156),
  sampleAt('2026-09-19T15:48:00Z', 5, 8.627450980392156),
  sampleAt('2026-09-19T16:04:30Z', 5, 8.627450980392156),
  sampleAt('2026-09-19T16:04:45Z', 5, 8.627450980392156),
  sampleAt('2026-09-19T16:05:00Z', 4.25, 8.627450980392156),
  sampleAt('2026-09-19T16:05:15Z', 4, 8.627450980392156),
  sampleAt('2026-09-19T16:05:30Z', 4, 8.627450980392156),
  sampleAt('2026-09-19T16:05:45Z', 4, 8.627450980392156),
  sampleAt('2026-09-19T16:06:00Z', 4, 8.627450980392156),
  sampleAt('2026-09-19T16:06:15Z', 4, 8.627450980392156),
  sampleAt('2026-09-19T16:06:30Z', 4, 8.627450980392156),
  sampleAt('2026-09-19T16:07:00Z', 4, 8.627450980392156),
  sampleAt('2026-09-19T16:07:15Z', 4, 8.627450980392156),
  sampleAt('2026-09-19T16:07:45Z', 4, 8.627450980392156),
  sampleAt('2026-09-19T16:11:15Z', 7.8, 16.27450980392157),
  sampleAt('2026-09-19T16:11:30Z', 14, 26.535947712418302),
  sampleAt('2026-09-19T16:12:00Z', 15, 28.627450980392158),
  sampleAt('2026-09-19T16:12:15Z', 16, 29.41176470588235),
  sampleAt('2026-09-19T16:12:30Z', 16, 30.980392156862745),
  sampleAt('2026-09-19T16:12:45Z', 17, 31.764705882352942),
  sampleAt('2026-09-19T16:13:00Z', 17, 31.764705882352942),
  sampleAt('2026-09-19T16:13:15Z', 17, 32.15686274509804),
  sampleAt('2026-09-19T16:13:30Z', 17, 32.549019607843135),
  sampleAt('2026-09-19T16:15:00Z', 17.75, 32.84313725490196),
  sampleAt('2026-09-19T16:15:15Z', 18, 33.26797385620916),
  sampleAt('2026-09-19T16:54:00Z', 18, 33.59477124183007),
  sampleAt('2026-09-19T16:54:15Z', 18, 33.72549019607843),
  sampleAt('2026-09-19T16:54:30Z', 18, 33.72549019607843),
  sampleAt('2026-09-19T16:54:45Z', 18, 33.72549019607843),
  sampleAt('2026-09-19T16:55:00Z', 18, 33.72549019607843),
  sampleAt('2026-09-19T16:55:30Z', 18, 33.72549019607843),
  sampleAt('2026-09-19T16:55:45Z', 18, 33.72549019607843),
  sampleAt('2026-09-19T16:56:00Z', 18, 33.72549019607843),
  sampleAt('2026-09-19T16:56:30Z', 18, 33.72549019607843),
  sampleAt('2026-09-19T16:57:00Z', 18, 33.72549019607843),
  sampleAt('2026-09-19T16:57:15Z', 18, 33.72549019607843),
  sampleAt('2026-09-19T16:57:45Z', 18, 33.72549019607843),
  sampleAt('2026-09-19T16:58:00Z', 18, 33.72549019607843),
  sampleAt('2026-09-19T16:58:15Z', 18, 33.72549019607843),
  sampleAt('2026-09-19T16:58:30Z', 18, 33.72549019607843),
];

export function buildWob20260919ObservedRefuelEpisodeSamples(
  includeDelayedPost: boolean,
): RawFuelSignalSample[] {
  const riseEndIdx = WOB_2026_09_19_OBSERVED_ABSOLUTE_FUEL_SAMPLES.findIndex(
    (s) => s.timestamp.toISOString() === '2026-09-19T16:15:15.000Z',
  );
  const throughRise = WOB_2026_09_19_OBSERVED_ABSOLUTE_FUEL_SAMPLES.slice(0, riseEndIdx + 1);
  if (!includeDelayedPost) {
    return throughRise;
  }
  return [...WOB_2026_09_19_OBSERVED_ABSOLUTE_FUEL_SAMPLES];
}
