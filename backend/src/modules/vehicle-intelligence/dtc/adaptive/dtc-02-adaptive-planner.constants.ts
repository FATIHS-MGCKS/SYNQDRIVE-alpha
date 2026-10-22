/** Legacy natural DTC scheduler cadence (unchanged in P3). */
export const DTC02_LEGACY_POLL_INTERVAL_MS = 3 * 60 * 60_000;

/** Shadow planner cannot propose deferral beyond this window from last successful check. */
export const DTC02_MAX_DEFERRAL_FROM_SUCCESS_MS = DTC02_LEGACY_POLL_INTERVAL_MS;

/** Minimum spacing between checks when accelerating (anti-starvation). */
export const DTC02_MIN_SHADOW_INTERVAL_MS = 15 * 60_000;

/** P6 standby reconcile policy (shadow hypothetical horizon — not production enqueue). */
export const DTC02_STANDBY_RECONCILE_INTERVAL_MS = 24 * 60 * 60_000;

/** Ignore trip FSM start/end intents older than this (delayed reconstruction guard). */
export const DTC02_TRIP_FSM_TRANSITION_MAX_AGE_MS = 20 * 60_000;

/** Coalesce trip START/END poll intents with recent poll metadata (short-trip guard). */
export const DTC02_TRIP_POLL_COALESCE_MS = DTC02_MIN_SHADOW_INTERVAL_MS;

/** Shadow-only proposal when active DTC codes are present. */
export const DTC02_ACTIVE_DTC_PROPOSED_INTERVAL_MS = 60 * 60_000;

/** Confirmed-complete source younger than this is treated as high-trust for deferral projection. */
export const DTC02_CONFIRMED_SOURCE_FRESH_MS = 2 * 60 * 60_000;

/** Aligns with DTC02 source-trust fleet snapshot stale threshold. */
export const DTC02_OPERATIONAL_STALE_MS = 6 * 60 * 60_000;
