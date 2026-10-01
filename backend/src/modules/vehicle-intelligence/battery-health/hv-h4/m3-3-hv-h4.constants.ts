/** M3.3-HV-H4 — exposure source + coverage authority (no cumulative exposure values). */
export const M3_3_HV_H4_EXPOSURE_SOURCE_AUTHORITY_V1 =
  'M3_3_HV_H4_EXPOSURE_SOURCE_AUTHORITY_V1' as const;

export const M3_3_HV_H4_COVERAGE_REPORT_V1 = 'M3_3_HV_H4_COVERAGE_REPORT_V1' as const;

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
