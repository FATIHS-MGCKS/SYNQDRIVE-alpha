/** Stable machine-readable observability export (S4F-1). */
export const DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1 = 'DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1';

export type DiV0S4fAnomalyKind =
  | 'RETIRED_PENDING_PRIMARY'
  | 'EXPIRED_LEASE'
  | 'RETRYABLE_DUE'
  | 'ATTEMPTS_EXHAUSTED'
  | 'BOUNDARY_MISMATCH_BEYOND_HORIZON'
  | 'ACTIVE_PIPELINE_EXECUTOR_UNAVAILABLE'
  | 'RETENTION_DUE'
  | 'PIN_STATE_INCONSISTENT'
  | 'CONTROL_PLANE_UNREADABLE'
  | 'ACTIVATION_GATE_UNSATISFIED'
  | 'RETIRED_NONTERMINAL_LEGACY';

export interface DiV0S4fWorkLifecycleCounts {
  PENDING: number;
  LEASED: number;
  FAILED_RETRYABLE: number;
  FAILED_TERMINAL: number;
  SUPERSEDED: number;
  COMPLETED: number;
  SKIPPED_INELIGIBLE: number;
}

export interface DiV0S4fLeaseHealthMetrics {
  expiredLeasedCount: number;
  activeLeasedCount: number;
  retryableDueCount: number;
  retryableFutureCount: number;
  attemptsExhaustedCount: number;
  oldestPendingAgeSeconds: number | null;
  oldestRetryableDueAgeSeconds: number | null;
}

export interface DiV0S4fPipelineHealthMetrics {
  activeRegistryCount: number;
  retiredRegistryCount: number;
  retiredNonterminalWorkCount: number;
  retiredPendingPrimaryCount: number;
  retiredNonterminalLegacyCount: number;
}

export interface DiV0S4fEvidenceStorageMetrics {
  snapshotCount: number;
  totalCompressedBytes: number;
  totalUncompressedBytes: number;
  retentionDueCount: number;
  oldestSnapshotAgeSeconds: number | null;
  workItemsWithPinCount: number;
  pinRequiredButMissingCount: number;
}

export interface DiV0S4fBeyondHorizonMetrics {
  beyondDriftHorizonBoundaryMismatchCount: number;
  beyondHorizonScannedCount: number;
  cursor: { settlementAnchorAt: string | null; workItemId: string | null };
}

export interface DiV0S4fExecutorLivenessMetrics {
  signal: 'LOCAL_REPLICA_REGISTRY_ONLY' | 'NO_EXECUTOR_REGISTERED';
  localExecutorReady: boolean;
  activePipelineCount: number;
  globalExecutorLivenessAuthorityPresent: false;
}

export interface DiV0S4fOperationalMetrics {
  workLifecycle: DiV0S4fWorkLifecycleCounts;
  leaseHealth: DiV0S4fLeaseHealthMetrics;
  pipelineHealth: DiV0S4fPipelineHealthMetrics;
  evidenceStorage: DiV0S4fEvidenceStorageMetrics;
  beyondHorizon: DiV0S4fBeyondHorizonMetrics;
  executorLiveness: DiV0S4fExecutorLivenessMetrics;
}

export interface DiV0S4fObservabilitySnapshotV1 {
  contractVersion: typeof DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1;
  s4aContractVersion: string;
  observedAt: string;
  timeAuthority: 'DB_CLOCK_TIMESTAMP';
  organizationScope: 'ALL' | 'SINGLE';
  organizationId?: string;
  reconciliation: {
    readOnly: true;
    bounded: true;
    cursorAuthority: 'SETTLEMENT_ANCHOR_AT_THEN_WORK_ITEM_ID';
    partial: boolean;
  };
  operational: DiV0S4fOperationalMetrics;
  anomalySamples: Partial<Record<DiV0S4fAnomalyKind, string[]>>;
}
