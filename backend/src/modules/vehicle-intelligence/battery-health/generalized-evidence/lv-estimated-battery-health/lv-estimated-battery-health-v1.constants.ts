export const LV_ESTIMATED_BATTERY_HEALTH_MODEL_VERSION =
  'LV_ESTIMATED_BATTERY_HEALTH_V1_2026-10-19';

/** Minimum independent qualified rest episodes for a provisional internal health estimate. */
export const LV_ESTIMATED_HEALTH_MIN_EPISODES_PROVISIONAL = 2;

/** Minimum episodes for longitudinal trend consideration (non-pseudoreplicated). */
export const LV_ESTIMATED_HEALTH_MIN_EPISODES_TREND = 3;

/** Crank evidence older than this (ms) vs evaluation time is treated stale for health authorization. */
export const LV_ESTIMATED_HEALTH_CRANK_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/** Default restore cutoff for separating recovered historic GE from post-restore ingestion (UTC). */
export const LV_ESTIMATED_HEALTH_DEFAULT_RESTORE_CUTOFF_ISO =
  '2026-10-17T21:55:43.000Z';
