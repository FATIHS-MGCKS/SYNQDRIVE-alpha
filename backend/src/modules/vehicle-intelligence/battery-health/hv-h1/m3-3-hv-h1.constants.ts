/** M3.3-HV-H1 — provider capability + evidence quality foundation (pure contracts). */

export const M3_3_HV_H1_PROVIDER_CAPABILITY_MATRIX_V1 =
  'M3_3_HV_H1_PROVIDER_CAPABILITY_MATRIX_V1' as const;

export const M3_3_HV_H1_EVIDENCE_QUALITY_V1 = 'M3_3_HV_H1_EVIDENCE_QUALITY_V1' as const;

export const M3_3_HV_H1_SESSION_EVIDENCE_LINKAGE_V1 =
  'M3_3_HV_H1_SESSION_EVIDENCE_LINKAGE_V1' as const;

export const M3_3_HV_H1_LONGITUDINAL_INPUT_CANDIDATE_V1 =
  'M3_3_HV_H1_LONGITUDINAL_INPUT_CANDIDATE_V1' as const;

export const M3_3_HV_H1_EVIDENCE_READINESS_REPORT_V1 =
  'M3_3_HV_H1_EVIDENCE_READINESS_REPORT_V1' as const;

export const BATTERY_HV_H1_ALLOW_PRODUCTION_READONLY_ENV_KEY =
  'BATTERY_HV_H1_ALLOW_PRODUCTION_READONLY';

export const METHOD_IDENTITY_REQUIRED = true as const;
export const CROSS_METHOD_POOLING_DEFAULT = false as const;

export const HV_H1_BATTERY_SCOPE = 'HV' as const;

export const HV_H1_MAX_FUTURE_TIMESTAMP_SKEW_MS = 60_000;

export const M3_3_HV_H1_MAX_SESSIONS_DEFAULT = 5;
export const M3_3_HV_H1_MAX_SESSIONS_HARD = 20;
export const M3_3_HV_H1_REPORT_TIMEOUT_MS = 60_000;

export const M3_3_HV_H1_REPORT_TEMPORAL_SEMANTICS = 'CURRENT_STATE_AT_QUERY' as const;
export const M3_3_HV_H1_HISTORICAL_ASOF_SUPPORTED = false as const;

/** Operator CLI only — no Nest controller, scheduler, or worker. */
export const H1_AUTOMATIC_RUNTIME_REACHABLE = false as const;
export const H1_OPERATOR_CLI_REACHABLE = true as const;
export const H1_CUSTOMER_RUNTIME_REACHABLE = false as const;

export const ENV_CONTRACT_ADDED = true as const;
export const PRODUCTION_ENV_CHANGE = false as const;
