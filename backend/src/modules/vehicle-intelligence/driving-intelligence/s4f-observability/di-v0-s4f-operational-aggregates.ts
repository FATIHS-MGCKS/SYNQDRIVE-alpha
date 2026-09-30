/**
 * Operational aggregate metrics in S4F are intentionally full-table read-only SQL aggregates.
 * They are NOT bounded by S4F diagnostic batch limits (see observability contract).
 */
export const DI_V0_S4F_OPERATIONAL_AGGREGATE_SCAN_KIND = 'FULL_TABLE_AGGREGATE' as const;

export const DI_V0_S4F_OPERATIONAL_AGGREGATE_INDEX_NOTES = [
  'di_v0_s4_work_items: status + next_attempt_at (retryable due)',
  'di_v0_s4_work_items: lease_expires_at (lease health)',
  'di_v0_s4_work_items: organization_id (tenant-scoped aggregates when filtered)',
  'di_v0_s4_evidence_snapshots: organization_id, retention_until',
  'di_v0_s4_pipeline_versions: status',
] as const;
