/**
 * Operational aggregate metrics in S4F are intentionally full-table read-only SQL aggregates.
 * They are NOT bounded by S4F diagnostic batch limits (see observability contract).
 */
export const DI_V0_S4F_OPERATIONAL_AGGREGATE_SCAN_KIND = 'FULL_TABLE_AGGREGATE' as const;

export const DI_V0_S4F_OPERATIONAL_AGGREGATE_INDEX_NOTES = [
  'di_v0_s4_work_items: di_v0_s4_wi_claim_idx (status, next_attempt_at) partial PENDING|FAILED_RETRYABLE',
  'di_v0_s4_work_items: di_v0_s4_wi_reap_idx (lease_expires_at) partial LEASED',
  'di_v0_s4_work_items: di_v0_s4_wi_org_trip_idx (organization_id, trip_id)',
  'di_v0_s4_evidence_snapshots: di_v0_s4_es_org_hash_uq / scope_hash_uq (no retention_until index in migrations)',
  'di_v0_s4_pipeline_versions: primary key only (status unindexed; small registry table)',
] as const;
