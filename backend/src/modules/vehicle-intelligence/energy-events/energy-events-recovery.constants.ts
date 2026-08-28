/**
 * E3A — fixed outage/recovery window for read-only dry-run analysis.
 * Do not use unbounded Date.now() during recovery processing.
 */
export const ENERGY_EVENTS_OUTAGE_START_ISO = '2026-07-16T00:00:00.000Z';

/** Last known healthy refuel row ≈ 2026-07-16 05:52 UTC (audit). */
export const ENERGY_EVENTS_LAST_HEALTHY_REFUEL_ISO = '2026-07-16T05:52:00.000Z';

/** Last known healthy recharge row ≈ 2026-07-17 00:02 UTC (audit). */
export const ENERGY_EVENTS_LAST_HEALTHY_RECHARGE_ISO = '2026-07-17T00:02:00.000Z';

/** Fixed recovery cutoff for E3A dry-run (explicit, not runtime now). */
export const ENERGY_EVENTS_RECOVERY_CUTOFF_ISO = '2026-08-28T08:00:00.000Z';

/** Conservative bounded DIMO query window (24h). Inclusive start, exclusive end. */
export const ENERGY_EVENTS_RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Canonical acceptance fixtures. */
export const KS_MX_2024_TOKEN_ID = 187336;
export const KS_MX_2024_CANONICAL_REFUEL_START = '2026-08-23T16:15:15.000Z';
export const TESLA_KS_FH_660E_TOKEN_ID = 186946;

/** Proposed real backfill execution budget (E3A estimate only). */
export const ENERGY_EVENTS_BACKFILL_PROPOSED_CONCURRENCY = 2;
export const ENERGY_EVENTS_BACKFILL_INTER_REQUEST_DELAY_MS = 500;
