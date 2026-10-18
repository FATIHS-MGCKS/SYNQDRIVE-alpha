/** Legacy natural DTC scheduler cadence (unchanged in P3). */
export const DTC02_LEGACY_POLL_INTERVAL_MS = 3 * 60 * 60_000;

/** Shadow planner cannot propose deferral beyond this window from last successful check. */
export const DTC02_MAX_DEFERRAL_FROM_SUCCESS_MS = DTC02_LEGACY_POLL_INTERVAL_MS;

/** Minimum spacing between checks when accelerating (anti-starvation). */
export const DTC02_MIN_SHADOW_INTERVAL_MS = 30 * 60_000;

/** Shadow-only proposal when active DTC codes are present. */
export const DTC02_ACTIVE_DTC_PROPOSED_INTERVAL_MS = 60 * 60_000;

/** Confirmed-complete source younger than this is treated as high-trust for deferral projection. */
export const DTC02_CONFIRMED_SOURCE_FRESH_MS = 2 * 60 * 60_000;

/** Aligns with DTC02 source-trust fleet snapshot stale threshold. */
export const DTC02_OPERATIONAL_STALE_MS = 6 * 60 * 60_000;
