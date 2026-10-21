/** M3.3C — shadow rest-session feature versioning (schema + pure policy). */

/** Combined persisted feature model (C3). */
export const REST_SESSION_FEATURE_MODEL_VERSION = 'M3_3C_C3_V1';

/** C1 pure retention policy version (unchanged in C3). */
export const REST_SESSION_RETENTION_POLICY_VERSION = 'M3_3C_C1_V1';

/** C2 charge raw policy version (not C1). */
export const REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION = 'M3_3C_C2_V1';

/** Normalized digest input contract (C3). */
export const REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION = 'M3_3C_FEATURE_INPUT_V1';

/** C5A read-only shadow inspection response contract. */
export const REST_SESSION_FEATURE_SHADOW_INSPECTION_CONTRACT_VERSION = 'M3_3C_C5A_V1';

export const REST_SESSION_FEATURE_SHADOW_INSPECTION_MAX_REVISIONS = 100;

export const REST_SESSION_FEATURE_COMPUTATION_MAX_CONFLICT_RETRIES = 3;

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
