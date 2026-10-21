/** M3.3-HV-H4-A3 — durable charge-session source evidence (A3.1 schema + A3.2 writer; no automatic runtime). */
export const M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1 =
  'M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1' as const;

export const M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1 =
  'M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1' as const;

export const M3_3_HV_H4_SOURCE_REVISION_FINGERPRINT_ALGORITHM =
  'SHA256_CANONICAL_ORDERED_JSON_V1' as const;

/** Allowed H4 throughput source energy field (semantic firewall). */
export const M3_3_HV_H4_A3_ALLOWED_SOURCE_ENERGY_FIELD = 'HvChargeSession.energyAddedKwh' as const;

export const M3_3_HV_H4_A3_SOURCE_ENERGY_SEMANTIC =
  'PROVIDER_REPORTED_CHARGING_ADDED_ENERGY_DELTA' as const;

export const A3_REVISION_WRITER_RUNTIME_REACHABLE = true as const;
export const A3_ACK_WRITER_RUNTIME_REACHABLE = true as const;
export const RETENTION_H4_ACK_GATE_REACHABLE = true as const;
export const A3_RECONCILIATION_SCHEDULER_REACHABLE = true as const;

export const REVISION_APPEND_ONLY_UPDATE_ALLOWED = false as const;
export const REVISION_APPEND_ONLY_UPSERT_MUTATING_EXISTING_ALLOWED = false as const;

export const SOURCE_HV_CHARGE_SESSION_ID_IS_CANONICAL_IDENTITY = false as const;
export const RAW_ROW_ID_STABILITY_ACROSS_PRUNE_REINGESTION_PROVEN = false as const;

export const DB_FLOAT_MIRROR_IS_FINGERPRINT_AUTHORITY = false as const;
export const SCIENTIFIC_ENERGY_IDENTITY_AUTHORITY = 'TAGGED_CANONICAL_EVIDENCE_JSON' as const;

/** Convenience DB mirror: finite values only; non-finite scientific tags mirror to SQL NULL. */
export const M3_3_HV_H4_A3_DB_FLOAT_MIRROR_POLICY =
  'FINITE_ONLY_NON_FINITE_TO_NULL_V1' as const;

export const ACK_IDENTITY_MIRROR_VERIFY_REQUIRED_IN_A3_2 = true as const;

export const M3_3_HV_H4_A3_SOURCE_REVISION_FINGERPRINT_HEX_PATTERN = /^[0-9a-f]{64}$/;

/** A3.3 MODE_A — current/final durable state with live A2 V1 knowledge gate (TARGET_1). */
export const A3_3_TARGET_MODE = 'A2_V1_PARITY' as const;

export const TARGET_1_PRELOAD_KNOWLEDGE_FILTER = false as const;
export const TARGET_1_A2_KNOWLEDGE_GATE_AFTER_LOAD = true as const;

export const APPLY_HARD_LIMIT_AFTER_EFFECTIVE_REVISION_COLLAPSE = true as const;
export const HARD_LIMIT_APPLIED_BEFORE_KNOWLEDGE_CLASSIFICATION = true as const;
export const REVISION_ROW_COUNT_AFFECTS_A1_SOURCE_TRUNCATION = false as const;
export const CANONICAL_SOURCE_SESSION_COUNT_AFFECTS_SOURCE_TRUNCATION = true as const;

/** MODE_A effective revision ordering: sourceUpdatedAt → capturedAt → revision.createdAt (fail-closed on tie + differing fingerprint). */
export const A3_3_MODE_A_EFFECTIVE_REVISION_ORDERING =
  'SOURCE_UPDATED_AT_THEN_CAPTURED_AT_THEN_REVISION_CREATED_AT_V1' as const;

export const A3_3_DURABLE_LOADER_RUNTIME_REACHABLE = false as const;
export const A3_3_MODE_B_TRUE_HISTORICAL_ASOF_IMPLEMENTED = false as const;
export const A3_3_HYBRID_LIVE_DURABLE_SOURCE_MODE = false as const;

/** M3.3-HV-H4-A3.3-O2-R1 — integrity attestation foundation (hybrid loader remains OFF). */
export const M3_3_HV_H4_A3_HISTORY_INTEGRITY_ATTESTATION_CONTRACT_V1 =
  'M3_3_HV_H4_A3_HISTORY_INTEGRITY_ATTESTATION_V1' as const;

export const A3_ATTESTATION_SCHEMA_PRESENT = true as const;
export const A3_ATTESTATION_INVALIDATION_DB_ENFORCED = true as const;
/** O2-R2: isolated TS issuer prototype in repo; not Nest/runtime reachable. */
export const A3_ATTESTATION_ISSUANCE_FOUNDATION_PRESENT = true as const;
export const A3_ATTESTATION_SQL_ISSUANCE_DEPLOYED = false as const;
export const A3_ATTESTATION_ISOLATED_TS_ISSUER_PROTOTYPE_PRESENT = true as const;
export const A3_ATTESTATION_ISOLATED_TS_ISSUER_RUNTIME_REACHABLE = false as const;
/** O2-R3: separate trusted process + dedicated credentials — not Nest/API reachable. */
export const A3_ATTESTATION_RECOMMENDED_ISSUER_PROCESS_MODEL =
  'SEPARATE_TRUSTED_ISSUER_PROCESS' as const;
export const A3_ATTESTATION_ISSUER_PROCESS_ISOLATION_ARCHITECTURE_PRESENT = true as const;
export const A3_ATTESTATION_ISSUER_INERT_FACTORY_PROTOTYPE_PRESENT = true as const;
export const A3_ATTESTATION_ISSUER_ADMISSION_AUTHORITY_PRESENT = true as const;
export const A3_ATTESTATION_PRODUCTION_ROLE_PREFLIGHT_SPEC_PRESENT = true as const;
/** O2-R3-H1: tenant scope gate only — not authenticated workflow admission. */
export const A3_ATTESTATION_REVISION_TENANT_SCOPE_MATCH_VERIFIED_BY_ISSUER = true as const;
export const A3_ATTESTATION_REQUESTED_BY_AUTHENTICATED = false as const;
export const A3_ATTESTATION_INTERNAL_WORKFLOW_ORIGIN_AUTHORIZED = false as const;
/** O2-R4.2A: documented human approval + target identity gate (repository; not production-certified). */
export const A3_ATTESTATION_PRODUCTION_PHASE_A_ADMISSION_CONTRACT_PRESENT = true as const;
export const A3_ATTESTATION_PRODUCTION_ADMISSION_AUTHORITY_COMPLETE = false as const;
export const A3_ATTESTATION_FUTURE_ADMISSION_AUTHORITY_CONTRACT_DEFINED = true as const;
export const A3_ATTESTATION_ISSUER_FACTORY_EXPECTED_DB_LOGIN_REQUIRED = true as const;
export const A3_ATTESTATION_PRE_PROVISION_PREFLIGHT_PHASE_DEFINED = true as const;
export const A3_ATTESTATION_POST_PROVISION_CERTIFICATION_PHASE_DEFINED = true as const;
/** O2-R4.1: executable Phase-A read-only preflight runner + CLI (isolated DB tests only; default OFF). */
export const A3_ATTESTATION_PHASE_A_EXECUTABLE_PREFLIGHT_RUNNER_PRESENT = true as const;
export const A3_ATTESTATION_PHASE_A_EXECUTABLE_PREFLIGHT_PRODUCTION_CERTIFIED = false as const;
/** O2-R2-H1: SELECT-only issuer uses SECURITY DEFINER row-lock function (repository prototype). */
export const A3_ATTESTATION_ISSUER_LOCK_AUTHORITY_SECURITY_DEFINER_V1 = true as const;
/** Set false until production DB role topology + SQL/TS parity are production-certified. */
export const A3_ATTESTATION_ISSUANCE_AUTHORITY_CERTIFIED = false as const;
export const A3_HYBRID_DURABLE_LOADER_RUNTIME_REACHABLE = false as const;
export const A3_ATTESTATION_BOOTSTRAP_RUNTIME_REACHABLE = false as const;
