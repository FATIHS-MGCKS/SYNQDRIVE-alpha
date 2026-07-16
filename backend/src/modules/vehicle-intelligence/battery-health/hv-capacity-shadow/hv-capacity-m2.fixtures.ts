/**
 * Tesla KS FH 660E audit intra-session samples (sanitized).
 * Median capacity ~55.5 kWh against 57 kWh repo reference.
 * Source: docs/audits/dimo-tesla-hv-signal-capability.md §12.
 */
import type { HvCapacityM2Sample } from './hv-capacity-m2.types';

export const TESLA_AUDIT_REFERENCE_CAPACITY_KWH = 57;
export const TESLA_AUDIT_EXPECTED_MEDIAN_KWH = 55.5;
export const TESLA_AUDIT_MEDIAN_TOLERANCE_KWH = 1.5;

function sample(
  iso: string,
  socPercent: number,
  currentEnergyKwh: number,
  energySkewMs = 0,
): HvCapacityM2Sample {
  const socObservedAt = new Date(iso);
  const energyObservedAt = new Date(socObservedAt.getTime() + energySkewMs);
  return {
    observedAt: socObservedAt,
    socPercent,
    currentEnergyKwh,
    socObservedAt,
    energyObservedAt,
    receivedAt: new Date(socObservedAt.getTime() + 2_000),
  };
}

/** Session 3 — audit median 55.56 kWh (32 samples in 10–90 % band). */
export const TESLA_AUDIT_M2_SESSION_3_SAMPLES: HvCapacityM2Sample[] = [
  sample('2026-06-18T06:00:00.000Z', 46.0, 25.53),
  sample('2026-06-18T06:15:00.000Z', 48.5, 26.92),
  sample('2026-06-18T06:30:00.000Z', 50.0, 27.75),
  sample('2026-06-18T06:45:00.000Z', 51.5, 28.58),
  sample('2026-06-18T07:00:00.000Z', 53.0, 29.42),
  sample('2026-06-18T07:15:00.000Z', 54.5, 30.25),
  sample('2026-06-18T07:30:00.000Z', 55.5, 30.8),
  sample('2026-06-18T07:45:00.000Z', 56.0, 31.08),
];

/** Session 4 — audit median 55.75 kWh (high ΔSOC session). */
export const TESLA_AUDIT_M2_SESSION_4_SAMPLES: HvCapacityM2Sample[] = [
  sample('2026-06-21T20:00:00.000Z', 38.0, 21.09),
  sample('2026-06-21T21:00:00.000Z', 44.0, 24.42),
  sample('2026-06-21T22:00:00.000Z', 50.0, 27.75),
  sample('2026-06-21T23:00:00.000Z', 55.0, 30.53),
  sample('2026-06-22T00:00:00.000Z', 58.0, 32.19),
  sample('2026-06-22T01:00:00.000Z', 60.5, 33.58),
  sample('2026-06-22T02:00:00.000Z', 61.5, 34.13),
];

/** Combined preferred-band samples for overall median assertion. */
export const TESLA_AUDIT_M2_ALL_PREFERRED_SAMPLES: HvCapacityM2Sample[] = [
  ...TESLA_AUDIT_M2_SESSION_3_SAMPLES,
  ...TESLA_AUDIT_M2_SESSION_4_SAMPLES,
];

/** Gate rejection fixtures. */
export const TESLA_AUDIT_M2_INVALID_SAMPLES = {
  zeroSoc: sample('2026-06-18T08:00:00.000Z', 0, 25.0),
  lowSoc: sample('2026-06-18T08:05:00.000Z', 5.0, 2.5),
  highSoc: sample('2026-06-18T08:10:00.000Z', 95.0, 52.0),
  timestampSkew: sample('2026-06-18T08:15:00.000Z', 50.0, 27.75, 120_000),
  implausibleEnergy: sample('2026-06-18T08:20:00.000Z', 50.0, 250),
  duplicateTimestampPair: [
    sample('2026-06-18T08:25:00.000Z', 50.0, 27.75),
    sample('2026-06-18T08:25:00.000Z', 51.0, 28.3),
  ],
  staleRepetitionPair: [
    sample('2026-06-18T08:30:00.000Z', 50.0, 27.75),
    {
      ...sample('2026-06-18T08:30:00.000Z', 50.0, 27.75),
      receivedAt: new Date('2026-06-18T08:40:00.000Z'),
    },
  ],
};
