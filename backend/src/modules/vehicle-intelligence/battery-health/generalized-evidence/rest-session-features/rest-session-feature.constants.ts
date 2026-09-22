/** M3.3C C1 — shadow rest-session feature versioning (schema + pure policy). */

export const REST_SESSION_FEATURE_MODEL_VERSION = 'M3_3C_C1_V1';

export const REST_SESSION_RETENTION_POLICY_VERSION = 'M3_3C_C1_V1';

export const REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION = 'M3_3C_C1_V1';

export const RETENTION_SLOPE_METHOD = 'THEIL_SEN_MEDIAN_PAIRWISE_SLOPE' as const;

export const RETENTION_MIN_SLOPE_POINTS = 2;

export const RETENTION_OUTLIER_POLICY =
  'NO_HARD_POINT_DELETION_THEIL_SEN_ROBUST_ONLY' as const;

export const RETENTION_TIME_AUTHORITY = 'actualRestAgeMs' as const;

/** Canonical retention voltage unit inside pure policy. */
export const RETENTION_VOLTAGE_INTERNAL_UNIT = 'millivolt' as const;

/** Positive shutdown delta = anchor mV − first rest mV (voltage dropped after anchor). */
export const SHUTDOWN_DELTA_SIGN_CONVENTION =
  'anchorVoltageMv_minus_firstRestVoltageMv_positive_means_drop' as const;
