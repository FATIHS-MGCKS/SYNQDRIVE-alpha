/** Offline / shadow-only P11 condition policy (default disabled in production Nest wiring). */
export const LV_ESTIMATED_BATTERY_HEALTH_P11_POLICY_ID =
  'LV_ESTIMATED_BATTERY_HEALTH_P11_CONDITION_POLICY_V2_2026-10-22';

/** Minimum rest age (hours) for any qualified P11 episode (same floor as N14 operational). */
export const P11_MIN_EPISODE_REST_AGE_HOURS = 1;

/** Stable REST evidence: minimum rest age after engine-off anchor. */
export const P11_STABLE_REST_MIN_AGE_HOURS = 4;

/** Follow-up window to detect pre-start / alternator wake after a REST sample. */
export const P11_PRE_START_FOLLOW_UP_MS = 120_000;

/** Heartbeat ladder nominal cadence (matches GE R1 metadata, not wake promotion). */
export const P11_HEARTBEAT_NOMINAL_HOURS = 8;

/** Tolerance around 8h ladder rungs for “stable heartbeat sequence” credit. */
export const P11_HEARTBEAT_RUNG_TOLERANCE_HOURS = 1.5;

/** Recency evaluation window (calendar). */
export const P11_RECENCY_WINDOW_DAYS = 14;

/** Minimum episodes in recency set when calendar window is sparse. */
export const P11_RECENCY_FALLBACK_EPISODE_COUNT = 5;

/** Trend: minimum independent episodes per chronological half. */
export const P11_TREND_MIN_EPISODES_PER_HALF = 3;

/** Trend deltas (mV) between half medians — aligned with P1 magnitudes. */
export const P11_TREND_DECLINE_DELTA_MV = -80;
export const P11_TREND_IMPROVING_DELTA_MV = 40;
export const P11_TREND_STABLE_ABS_DELTA_MV = 40;
