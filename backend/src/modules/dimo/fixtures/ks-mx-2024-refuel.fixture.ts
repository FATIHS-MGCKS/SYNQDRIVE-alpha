/**
 * KS MX 2024 refuel evidence — E2 detector sensitivity reference case.
 *
 * Audit: docs/audits/trip-enrichment-driver-score-energy-events-audit-2026-08.md
 * Date: 2026-08-23
 * tokenId: 187336
 * License plate: KS MX 2024
 *
 * E2 applies production refuel detector config (minIncreasePercent: 5).
 * Default DIMO config returns [] for this refuel.
 */
export const KS_MX_2024_TOKEN_ID = 187336;

export const KS_MX_2024_REFUEL_WINDOW = {
  from: '2026-08-22T00:00:00.000Z',
  to: '2026-08-24T00:00:00.000Z',
} as const;

/** Relative fuel level jumped ~13% → ~42% around 16:15 UTC. */
export const KS_MX_2024_FUEL_LEVEL_EVIDENCE = {
  startRelativePercent: 13,
  endRelativePercent: 42,
  refuelStartUtc: '2026-08-23T16:15:15.000Z',
  refuelEndUtc: '2026-08-23T16:23:16.000Z',
} as const;

/** DIMO default refuel config — no segment emitted (E2 must fix). */
export const KS_MX_2024_DEFAULT_CONFIG_SEGMENTS: unknown[] = [];

/** DIMO with config:{minIncreasePercent:5} — segment detected. */
export const KS_MX_2024_TUNED_CONFIG_SEGMENT = {
  start: {
    timestamp: KS_MX_2024_FUEL_LEVEL_EVIDENCE.refuelStartUtc,
    value: { latitude: 51.31, longitude: 9.49 },
  },
  end: {
    timestamp: KS_MX_2024_FUEL_LEVEL_EVIDENCE.refuelEndUtc,
    value: { latitude: 51.31, longitude: 9.49 },
  },
  duration: 481,
  isOngoing: false,
  startedBeforeRange: false,
  signals: [
    {
      name: 'powertrainFuelSystemRelativeLevel',
      value: KS_MX_2024_FUEL_LEVEL_EVIDENCE.startRelativePercent,
    },
    {
      name: 'powertrainFuelSystemRelativeLevel',
      value: KS_MX_2024_FUEL_LEVEL_EVIDENCE.endRelativePercent,
    },
  ],
} as const;
