/** M3.3C C2 — charge opportunity raw extraction (read-only; no persistence). */

export const CHARGE_OPPORTUNITY_RAW_POLICY_VERSION = 'M3_3C_C2_V1';

/** C2 v1 — no inferred trip window for unlinked sessions. */
export const UNLINKED_CHARGE_CONTEXT_POLICY = 'NO_INFERRED_TRIP_WINDOW' as const;

export const CHARGE_OPPORTUNITY_THRESHOLD_STATUS = 'NOT_PRODUCTION_CALIBRATED' as const;

export const ENGINE_RUNNING_COVERAGE_V1 = 'DEFERRED_NO_BRIDGE_POLICY' as const;

export const LV_VOLTAGE_TIME_PROXY_V1 = 'DEFERRED_NO_BRIDGE_POLICY' as const;
