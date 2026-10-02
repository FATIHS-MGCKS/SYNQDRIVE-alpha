/** Stable machine-readable observability export (S4F-1). */
export const DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1 = 'DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1';

export type DiV0S4fAnomalyKind =
  | 'RETIRED_PENDING_PRIMARY'
  | 'RETIRED_PENDING_PRIMARY_CLASS_A_VIOLATION'
  | 'EXPIRED_LEASE'
  | 'RETRYABLE_DUE'
  | 'ATTEMPTS_EXHAUSTED'
  | 'BOUNDARY_MISMATCH_BEYOND_HORIZON'
  | 'BEYOND_HORIZON_SCOPE_CORRUPTION'
  | 'ACTIVE_PIPELINE_EXECUTOR_UNAVAILABLE'
  | 'RETENTION_DUE'
  | 'PIN_STATE_INCONSISTENT'
  | 'CONTROL_PLANE_UNREADABLE'
  | 'CONTROL_PLANE_MISSING'
  | 'CONTROL_PLANE_MALFORMED'
  | 'ACTIVATION_GATE_UNSATISFIED'
  | 'RETIRED_NONTERMINAL_PROVENANCE_UNKNOWN';

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
  retryableDueClaimableCount: number;
  retryableFutureCount: number;
  t10ExhaustedCandidateCount: number;
  oldestPendingAgeSeconds: number | null;
  oldestRetryableDueAgeSeconds: number | null;
}

export interface DiV0S4fPipelineHealthMetrics {
  activeRegistryCount: number;
  retiredRegistryCount: number;
  retiredNonterminalWorkCount: number;
  retiredPendingPrimaryClassAViolationCount: number;
  retiredValidUnexpiredLeasedCount: number;
  retiredExpiredLeasedT12EligibleCount: number;
  retiredNonterminalProvenanceUnknownCount: number;
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
  beyondDriftHorizonScopeCorruptionCount: number;
  beyondHorizonScannedCount: number;
  cursor: {
    scanWatermarkCreatedAt: string | null;
    settlementAnchorAt: string | null;
    workItemId: string | null;
  };
}

export interface DiV0S4fExecutorLivenessMetrics {
  signal: 'LOCAL_REPLICA_REGISTRY_ONLY' | 'NO_EXECUTOR_REGISTERED';
  localExecutorReady: boolean;
  activePipelineCount: number;
  globalExecutorLivenessAuthorityPresent: false;
}

export type DiV0S4fControlPlaneReadability = 'READABLE' | 'MISSING' | 'UNREADABLE' | 'MALFORMED';

export interface DiV0S4fControlPlaneMetrics {
  readability: DiV0S4fControlPlaneReadability;
  killState: 'KILLED' | 'NOT_KILLED' | 'UNKNOWN';
  killReason: string | null;
}

export interface DiV0S4fOperationalMetrics {
  workLifecycle: DiV0S4fWorkLifecycleCounts;
  leaseHealth: DiV0S4fLeaseHealthMetrics;
  pipelineHealth: DiV0S4fPipelineHealthMetrics;
  evidenceStorage: DiV0S4fEvidenceStorageMetrics;
  beyondHorizon: DiV0S4fBeyondHorizonMetrics;
  executorLiveness: DiV0S4fExecutorLivenessMetrics;
  controlPlane: DiV0S4fControlPlaneMetrics;
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
    diagnosticReconciliation: {
      bounded: true;
      cursorAuthority: 'SCAN_WATERMARK_CREATED_AT_THEN_SETTLEMENT_ANCHOR_AT_THEN_WORK_ITEM_ID';
      scanWatermarkCreatedAt: string | null;
      partial: boolean;
    };
    operationalAggregates: {
      bounded: false;
      scanKind: 'FULL_TABLE_AGGREGATE';
      indexNotes: readonly string[];
    };
  };
  operational: DiV0S4fOperationalMetrics;
  anomalySamples: Partial<Record<DiV0S4fAnomalyKind, string[]>>;
}
