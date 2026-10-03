export const M3_3_HV_H4_A3_RECONCILIATION_CLASSIFICATION =
  'CURRENT_STATE_RECONCILIATION' as const;

export type M3_3HvH4A3FleetCursorV1 = {
  organizationId: string;
  vehicleId: string;
  id: string;
};

export type M3_3HvH4A3ReconciliationRowOutcomeV1 =
  | 'CREATED'
  | 'ALREADY_DURABLE'
  | 'ACK_REPAIRED'
  | 'SOURCE_CHANGED_DURING_RECONCILIATION'
  | 'SOURCE_ALREADY_GONE'
  | 'BLOCKED_INTEGRITY'
  | 'BLOCKED_TENANT_INVARIANT'
  | 'ERROR';

export type M3_3HvH4A3ReconciliationTickResultV1 =
  | 'SKIPPED_FLAG_OFF'
  | 'CURSOR_UNAVAILABLE'
  | 'COMPLETED';

export type M3_3HvH4A3ReconciliationTickOutcomeV1 = {
  result: M3_3HvH4A3ReconciliationTickResultV1;
  inspectedCount: number;
  createdCount: number;
  existingCount: number;
  ackRepairCount: number;
  sourceChangedCount: number;
  blockedIntegrityCount: number;
  blockedTenantCount: number;
  errorCount: number;
  materializedOrRepairedCount: number;
  durationMs: number;
};

export type M3_3HvH4A3ReconciliationSchedulerTickResultV1 =
  | 'FLAG_OFF'
  | 'NOT_LEADER'
  | 'OVERLAP'
  | 'COMPLETED'
  | 'FAILED'
  | 'CURSOR_UNAVAILABLE';
