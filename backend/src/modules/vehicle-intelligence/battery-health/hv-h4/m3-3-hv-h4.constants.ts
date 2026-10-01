/** M3.3-HV-H4 — exposure source + coverage authority (no cumulative exposure values). */
export const M3_3_HV_H4_EXPOSURE_SOURCE_AUTHORITY_V1 =
  'M3_3_HV_H4_EXPOSURE_SOURCE_AUTHORITY_V1' as const;

export const M3_3_HV_H4_COVERAGE_REPORT_V1 = 'M3_3_HV_H4_COVERAGE_REPORT_V1' as const;

export const M3_3_HV_H4_BOUNDED_CHARGE_THROUGHPUT_V1 =
  'M3_3_HV_H4_BOUNDED_CHARGE_THROUGHPUT_V1' as const;

export const M3_3_HV_H4_CHARGE_THROUGHPUT_REPORT_V1 =
  'M3_3_HV_H4_CHARGE_THROUGHPUT_REPORT_V1' as const;

/** A2.1 — current durable row must not postdate evaluationAt for historical composition. */
export const M3_3_HV_H4_SESSION_KNOWLEDGE_ASOF_POLICY =
  'CURRENT_ROW_MUST_NOT_POSTDATE_EVALUATION_AT' as const;

export const M3_3_HV_H4_CHARGE_THROUGHPUT_SUMMATION_METHOD =
  'NEUMAIER_COMPENSATED_SUM_V1' as const;

/** Non-positive native energyAddedKwh never contributes; session remains in diagnostics. */
export const M3_3_HV_H4_NON_POSITIVE_ENERGY_POLICY = 'EXCLUDE_AND_REPORT' as const;

/** Required native added-energy provenance for A2 composition V1. */
export const M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE = 'SEGMENT_EXTREMA' as const;

export const BATTERY_HV_H4_ALLOW_PRODUCTION_READONLY_ENV_KEY =
  'BATTERY_HV_H4_ALLOW_PRODUCTION_READONLY' as const;

/** Read-only CLI / report — must not register in Nest app.module. */
export const H4_AUTOMATIC_RUNTIME_REACHABLE = false as const;

export const M3_3_HV_H4_REPORT_TIMEOUT_MS = 120_000;

/** Default retention windows (authority documentation — matches battery-v2-retention.config defaults). */
export const M3_3_HV_H4_DEFAULT_RETENTION_DAYS = {
  hvProviderSnapshots: 365,
  hvChargeSessions: 1095,
  hfRawPoints: 90,
  hfWindows: 180,
} as const;

export const EXISTING_RETENTION_AGGREGATES_PRESERVE_CHARGE_THROUGHPUT = false as const;

export const CLICKHOUSE_CANONICAL_H4_EXPOSURE_AUTHORITY = false as const;

export const FEC_FORMULA_AUTHORITY_REQUIRED = true as const;
export const FEC_READY_FOR_IMPLEMENTATION = false as const;

export const ODOMETER_LIFECYCLE_BASELINE_KNOWN = false as const;

export const NATIVE_FALLBACK_CHARGING_ADDED_SEMANTIC_EQUIVALENCE_PROVEN = false as const;

/** Safety cap for charge-session reads — pagination continues until evaluationAt or this limit. */
export const M3_3_HV_H4_CHARGE_SESSION_LOAD_HARD_LIMIT = 5_000;
export const M3_3_HV_H4_CHARGE_SESSION_PAGE_SIZE = 500;
