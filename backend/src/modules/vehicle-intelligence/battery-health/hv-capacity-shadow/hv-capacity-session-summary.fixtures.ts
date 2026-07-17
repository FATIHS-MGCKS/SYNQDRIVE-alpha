/**
 * Session summary aggregation fixtures — stable Tesla vs unstable scatter.
 */
import type { HvCapacitySessionSummaryInputObservation } from './hv-capacity-session-summary.types';

function obs(
  iso: string,
  capacityKwh: number,
  socPercent: number,
  options?: { outlier?: boolean; preferredSocBand?: boolean },
): HvCapacitySessionSummaryInputObservation {
  return {
    observedAt: new Date(iso),
    estimatedCapacityKwh: capacityKwh,
    socPercent,
    preferredSocBand:
      options?.preferredSocBand ?? (socPercent >= 10 && socPercent <= 90),
    outlier: options?.outlier ?? false,
    quality: options?.outlier ? 'INSUFFICIENT_COVERAGE' : 'SHADOW',
  };
}

/** Stable session — tight cluster around 55.5 kWh (Tesla audit-like). */
export const STABLE_SESSION_SUMMARY_OBSERVATIONS: HvCapacitySessionSummaryInputObservation[] =
  [
    obs('2026-06-18T06:00:00.000Z', 55.44, 46),
    obs('2026-06-18T06:15:00.000Z', 55.5, 48.5),
    obs('2026-06-18T06:30:00.000Z', 55.52, 50),
    obs('2026-06-18T06:45:00.000Z', 55.48, 51.5),
    obs('2026-06-18T07:00:00.000Z', 55.56, 53),
    obs('2026-06-18T07:15:00.000Z', 55.54, 54.5),
    obs('2026-06-18T07:30:00.000Z', 55.55, 55.5),
    obs('2026-06-18T07:45:00.000Z', 55.57, 56),
  ];

/** Unstable session — wide scatter and outliers, high CV. */
export const UNSTABLE_SESSION_SUMMARY_OBSERVATIONS: HvCapacitySessionSummaryInputObservation[] =
  [
    obs('2026-06-19T06:00:00.000Z', 48.2, 42),
    obs('2026-06-19T06:20:00.000Z', 52.1, 48),
    obs('2026-06-19T06:40:00.000Z', 58.7, 54),
    obs('2026-06-19T07:00:00.000Z', 63.4, 58),
    obs('2026-06-19T07:20:00.000Z', 49.8, 45),
    obs('2026-06-19T07:40:00.000Z', 71.2, 62, { outlier: true }),
    obs('2026-06-19T08:00:00.000Z', 54.6, 50),
    obs('2026-06-19T08:20:00.000Z', 66.9, 60),
  ];

/** Insufficient sample session. */
export const INSUFFICIENT_SESSION_SUMMARY_OBSERVATIONS: HvCapacitySessionSummaryInputObservation[] =
  [
    obs('2026-06-20T06:00:00.000Z', 55.5, 50),
    obs('2026-06-20T06:30:00.000Z', 55.6, 52),
  ];

export const STABLE_SESSION_SUMMARY_CONTEXT = {
  sessionStartAt: new Date('2026-06-18T06:00:00.000Z'),
  sessionEndAt: new Date('2026-06-18T08:00:00.000Z'),
  isOngoing: false,
  capacityShadowEligible: true,
  qualityStatus: 'QUALIFIED',
} as const;

export const UNSTABLE_SESSION_SUMMARY_CONTEXT = {
  sessionStartAt: new Date('2026-06-19T06:00:00.000Z'),
  sessionEndAt: new Date('2026-06-19T08:30:00.000Z'),
  isOngoing: false,
  capacityShadowEligible: true,
  qualityStatus: 'PARTIAL',
} as const;
