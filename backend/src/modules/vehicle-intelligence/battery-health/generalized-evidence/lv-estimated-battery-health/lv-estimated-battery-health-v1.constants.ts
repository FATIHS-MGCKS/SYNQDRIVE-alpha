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

/** Research policy P3 (offline only): minimum qualified REST episodes for GREEN. */
export const LV_ESTIMATED_HEALTH_RESEARCH_P3_MIN_EPISODES = 8;

/** Research policy P3 (offline only): minimum calendar span of qualified episode timestamps (days). */
export const LV_ESTIMATED_HEALTH_RESEARCH_P3_MIN_OBSERVATION_SPAN_DAYS = 14;

export const LV_ESTIMATED_BATTERY_HEALTH_RESEARCH_POLICY_P2_ID =
  'LV_ESTIMATED_BATTERY_HEALTH_V1_RESEARCH_POLICY_P2_LOAD_REQUIRED_2026-10-21';

export const LV_ESTIMATED_BATTERY_HEALTH_RESEARCH_POLICY_P3_ID =
  'LV_ESTIMATED_BATTERY_HEALTH_V1_RESEARCH_POLICY_P3_CONSERVATIVE_2026-10-21';
