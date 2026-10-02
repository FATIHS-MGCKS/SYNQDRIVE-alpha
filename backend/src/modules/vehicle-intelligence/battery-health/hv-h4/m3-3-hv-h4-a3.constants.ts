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

export const A3_REVISION_WRITER_RUNTIME_REACHABLE = false as const;
export const A3_ACK_WRITER_RUNTIME_REACHABLE = false as const;
export const RETENTION_H4_ACK_GATE_REACHABLE = false as const;
export const A3_RECONCILIATION_SCHEDULER_REACHABLE = false as const;

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
