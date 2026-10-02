/**
 * DI V0 S4A dormant execution foundation — machine constants mirrored from
 * architecture/drivingintelligence/design/s4a/s4a-contract.v2.json (DI_V0_S4A_CONTRACT_V2).
 * The contract JSON is authoritative; `__tests__/di-v0-s4a-contract-parity.spec.ts` fails on drift.
 */

export const DI_V0_S4A_CONTRACT_VERSION = 'DI_V0_S4A_CONTRACT_V2';
export const DI_V0_S4_ORCHESTRATION_CONTRACT_VERSION = 'DI_V0_S4_ORCHESTRATION_CONTRACT_V2';
export const DI_V0_S4_PIPELINE_KEY_PREFIX = 'DI_V0_S4_PIPELINE_V1';
export const DI_V0_S4_BOUNDARY_FP_VERSION = 'DI_V0_S4_BOUNDARY_FP_V1';
/** Historical execution identity (immutable semantics for pre-S4B rows). */
export const DI_V0_S4_EXECUTION_IDENTITY_V1_VERSION = 'DI_V0_S4_EXECUTION_IDENTITY_V1';
/** Active runtime execution identity (includes boundaryOccurrence). */
export const DI_V0_S4_EXECUTION_IDENTITY_VERSION = 'DI_V0_S4_EXECUTION_IDENTITY_V2';
export const DI_V0_S4_EXECUTION_IDENTITY_V2_VERSION = 'DI_V0_S4_EXECUTION_IDENTITY_V2';
export const DI_V0_COMBINED_INPUT_IDENTITY_V0_3 = 'DI_V0_COMBINED_INPUT_IDENTITY_V0_3';
export const DI_V0_S4_EVIDENCE_SNAPSHOT_HASH_PREFIX = 'DI_V0_S4_EVIDENCE_V1';
export const DI_V0_S4_EVIDENCE_CONTAINER_VERSION = 'DI_V0_S4_EVIDENCE_CONTAINER_V1';
export const DI_V0_S4_CHANNEL_POLICY_V1 = 'DI_V0_S4_CHANNEL_POLICY_V1';

export const DI_V0_S4_LIMITS = {
  maxAcquisitionWindowSeconds: 28_800,
  leaseDurationSeconds: 300,
  heartbeatIntervalSeconds: 60,
  workExecutionBudgetSeconds: 240,
  absoluteLeaseLifetimeCeilingSeconds: 900,
  maxAttempts: 5,
  retryBackoffSeconds: [900, 3_600, 14_400, 14_400, 14_400] as readonly number[],
  settlementQuietPeriodSeconds: 86_400,
  driftHorizonSeconds: 864_000,
  maxUncompressedSnapshotBytes: 16_777_216,
} as const;

/** Proposed default (DI-GAP-S4-LOCATION-RETENTION-001, not a legal conclusion). */
export const DI_V0_S4_SNAPSHOT_RETENTION_DAYS = 90;

export const DI_V0_S4_STATES = [
  'PENDING',
  'LEASED',
  'FAILED_RETRYABLE',
  'COMPLETED',
  'FAILED_TERMINAL',
  'SKIPPED_INELIGIBLE',
  'SUPERSEDED',
] as const;
export type DiV0S4State = (typeof DI_V0_S4_STATES)[number];
export type DiV0S4FromState = DiV0S4State | 'NONE';

/** Terminal work-item states an executor may reach before reporting SETTLED (contract v2). */
export const DI_V0_S4_EXECUTOR_TERMINAL_STATES = [
  'COMPLETED',
  'FAILED_TERMINAL',
  'SKIPPED_INELIGIBLE',
  'SUPERSEDED',
] as const satisfies readonly DiV0S4State[];
export type DiV0S4ExecutorTerminalState = (typeof DI_V0_S4_EXECUTOR_TERMINAL_STATES)[number];

export const DI_V0_S4_RUN_PURPOSES = ['PRIMARY', 'RECALIBRATION_REPLAY', 'REACQUISITION'] as const;
export type DiV0S4RunPurpose = (typeof DI_V0_S4_RUN_PURPOSES)[number];

export const DI_V0_S4_SOURCE_FAMILIES = ['RUPTELA_R1', 'API_SYNTHETIC', 'UNKNOWN'] as const;
export type DiV0S4SourceFamily = (typeof DI_V0_S4_SOURCE_FAMILIES)[number];

export const DI_V0_S4_SUPERSEDED_REASONS = [
  'BOUNDARY_CHANGED',
  'TRIP_NOT_COMPLETED',
  'TRIP_CANCELLED',
  'PIPELINE_RETIRED',
  'OPERATOR',
] as const;
export type DiV0S4SupersededReason = (typeof DI_V0_S4_SUPERSEDED_REASONS)[number];

/** Closed list of permanent-ineligibility codes accepted by T09 (S4A_CONTRACT_DESIGN §2.1, §4). */
export const DI_V0_S4_SKIP_REASONS = ['WINDOW_EXCEEDS_MAX_8H', 'POSITION_UNSUPPORTED_SOURCE'] as const;
export type DiV0S4SkipReason = (typeof DI_V0_S4_SKIP_REASONS)[number];

export type DiV0S4TransitionId =
  | 'T01_CREATE'
  | 'T02_CLAIM'
  | 'T03_HEARTBEAT'
  | 'T04_TAKEOVER'
  | 'T05_PIN'
  | 'T06_COMPLETE'
  | 'T07_FAIL_RETRYABLE'
  | 'T08_FAIL_TERMINAL'
  | 'T09_SKIP_INELIGIBLE'
  | 'T10_EXHAUST'
  | 'T11_SUPERSEDE'
  | 'T12_RETIRE'
  | 'T13_HOLDER_SUPERSEDE';

export type DiV0S4Actor =
  | 'DISCOVERY'
  | 'WORKER'
  | 'LEASE_HOLDER'
  | 'REAPER'
  | 'DRIFT_WATCHER'
  | 'RETIREMENT_REAPER';

export interface DiV0S4TransitionSpec {
  id: DiV0S4TransitionId;
  from: readonly DiV0S4FromState[];
  to: DiV0S4State;
  actor: DiV0S4Actor;
  leaseEpoch: 'INIT_ZERO' | 'INCREMENT' | 'KEEP';
  attemptCount: 'INIT_ZERO' | 'INCREMENT' | 'KEEP';
  lease: 'NONE' | 'SET' | 'EXTEND' | 'KEEP' | 'CLEAR';
  guards: readonly string[];
}

export const DI_V0_S4_TRANSITIONS: readonly DiV0S4TransitionSpec[] = [
  {
    id: 'T01_CREATE',
    from: ['NONE'],
    to: 'PENDING',
    actor: 'DISCOVERY',
    leaseEpoch: 'INIT_ZERO',
    attemptCount: 'INIT_ZERO',
    lease: 'NONE',
    guards: [
      'TENANT_SCOPE_VALID',
      'LOGICAL_KEY_UNIQUE',
      'ACTIVE_PRIMARY_UNIQUE',
      'CONTROL_PLANE_DISCOVERY_ENABLED',
      'PIPELINE_VERSION_ACTIVE',
      'CONTROL_PLANE_DB_NOT_KILLED',
    ],
  },
  {
    id: 'T02_CLAIM',
    from: ['PENDING', 'FAILED_RETRYABLE'],
    to: 'LEASED',
    actor: 'WORKER',
    leaseEpoch: 'INCREMENT',
    attemptCount: 'INCREMENT',
    lease: 'SET',
    guards: [
      'NEXT_ATTEMPT_DUE',
      'ATTEMPTS_REMAINING',
      'SKIP_LOCKED',
      'PIPELINE_VERSION_MATCH',
      'CONTROL_PLANE_WORKER_ENABLED',
      'PIPELINE_VERSION_ACTIVE',
      'CONTROL_PLANE_DB_NOT_KILLED',
    ],
  },
  {
    id: 'T03_HEARTBEAT',
    from: ['LEASED'],
    to: 'LEASED',
    actor: 'LEASE_HOLDER',
    leaseEpoch: 'KEEP',
    attemptCount: 'KEEP',
    lease: 'EXTEND',
    guards: ['EPOCH_MATCH', 'LEASE_NOT_EXPIRED_DB_CLOCK', 'LEASE_CEILING_APPLIED', 'CONTROL_PLANE_DB_NOT_KILLED'],
  },
  {
    id: 'T04_TAKEOVER',
    from: ['LEASED'],
    to: 'LEASED',
    actor: 'WORKER',
    leaseEpoch: 'INCREMENT',
    attemptCount: 'INCREMENT',
    lease: 'SET',
    guards: [
      'LEASE_EXPIRED_DB_CLOCK',
      'ATTEMPTS_REMAINING',
      'SKIP_LOCKED',
      'PIPELINE_VERSION_MATCH',
      'CONTROL_PLANE_WORKER_ENABLED',
      'PIPELINE_VERSION_ACTIVE',
      'CONTROL_PLANE_DB_NOT_KILLED',
    ],
  },
  {
    id: 'T05_PIN',
    from: ['LEASED'],
    to: 'LEASED',
    actor: 'LEASE_HOLDER',
    leaseEpoch: 'KEEP',
    attemptCount: 'KEEP',
    lease: 'KEEP',
    guards: [
      'EPOCH_MATCH',
      'LEASE_NOT_EXPIRED_DB_CLOCK',
      'PIN_NOT_SET',
      'SNAPSHOT_SAME_TENANT',
      'CONTROL_PLANE_WORKER_ENABLED',
      'CONTROL_PLANE_DB_NOT_KILLED',
    ],
  },
  {
    id: 'T06_COMPLETE',
    from: ['LEASED'],
    to: 'COMPLETED',
    actor: 'LEASE_HOLDER',
    leaseEpoch: 'KEEP',
    attemptCount: 'KEEP',
    lease: 'CLEAR',
    guards: [
      'ROW_LOCK',
      'EPOCH_MATCH',
      'LEASE_NOT_EXPIRED_DB_CLOCK',
      'PIN_SET',
      'BOUNDARY_FINGERPRINT_UNCHANGED',
      'TENANT_SCOPE_VALID',
      'S2_WRITTEN_SAME_TX',
      'PIPELINE_VERSION_MATCH',
      'CONTROL_PLANE_WORKER_ENABLED',
      'PIPELINE_VERSION_ACTIVE',
      'S2_EXECUTION_IDENTITY_MATCH',
      'CONTROL_PLANE_DB_NOT_KILLED',
    ],
  },
  {
    id: 'T07_FAIL_RETRYABLE',
    from: ['LEASED'],
    to: 'FAILED_RETRYABLE',
    actor: 'LEASE_HOLDER',
    leaseEpoch: 'KEEP',
    attemptCount: 'KEEP',
    lease: 'CLEAR',
    guards: ['ROW_LOCK', 'EPOCH_MATCH', 'LEASE_NOT_EXPIRED_DB_CLOCK', 'ATTEMPTS_REMAINING', 'FAILURE_RETRYABLE'],
  },
  {
    id: 'T08_FAIL_TERMINAL',
    from: ['LEASED'],
    to: 'FAILED_TERMINAL',
    actor: 'LEASE_HOLDER',
    leaseEpoch: 'KEEP',
    attemptCount: 'KEEP',
    lease: 'CLEAR',
    guards: ['ROW_LOCK', 'EPOCH_MATCH', 'LEASE_NOT_EXPIRED_DB_CLOCK', 'FAILURE_REASON_SET', 'CONTROL_PLANE_DB_NOT_KILLED'],
  },
  {
    id: 'T09_SKIP_INELIGIBLE',
    from: ['LEASED'],
    to: 'SKIPPED_INELIGIBLE',
    actor: 'LEASE_HOLDER',
    leaseEpoch: 'KEEP',
    attemptCount: 'KEEP',
    lease: 'CLEAR',
    guards: [
      'ROW_LOCK',
      'EPOCH_MATCH',
      'LEASE_NOT_EXPIRED_DB_CLOCK',
      'PIN_NOT_SET',
      'RUN_PURPOSE_NOT_RECALIBRATION_REPLAY',
      'PERMANENT_INELIGIBILITY_FOR_FINGERPRINT',
      'CONTROL_PLANE_DB_NOT_KILLED',
    ],
  },
  {
    id: 'T10_EXHAUST',
    from: ['LEASED'],
    to: 'FAILED_TERMINAL',
    actor: 'REAPER',
    leaseEpoch: 'INCREMENT',
    attemptCount: 'KEEP',
    lease: 'CLEAR',
    guards: [
      'LEASE_EXPIRED_DB_CLOCK',
      'ATTEMPTS_EXHAUSTED',
      'SKIP_LOCKED',
      'CONTROL_PLANE_MAINTENANCE_ENABLED',
      'CONTROL_PLANE_DB_NOT_KILLED',
    ],
  },
  {
    id: 'T11_SUPERSEDE',
    from: ['PENDING', 'LEASED', 'FAILED_RETRYABLE', 'COMPLETED', 'FAILED_TERMINAL', 'SKIPPED_INELIGIBLE'],
    to: 'SUPERSEDED',
    actor: 'DRIFT_WATCHER',
    leaseEpoch: 'INCREMENT',
    attemptCount: 'KEEP',
    lease: 'CLEAR',
    guards: [
      'ROW_LOCK',
      'BOUNDARY_FINGERPRINT_CHANGED',
      'SUPERSESSION_REASON_SET',
      'SUCCESSOR_SAME_TENANT_AND_TRIP_OR_NULL',
      'CONTROL_PLANE_MAINTENANCE_ENABLED',
      'CONTROL_PLANE_DB_NOT_KILLED',
    ],
  },
  {
    id: 'T12_RETIRE',
    from: ['PENDING', 'LEASED', 'FAILED_RETRYABLE'],
    to: 'SUPERSEDED',
    actor: 'RETIREMENT_REAPER',
    leaseEpoch: 'INCREMENT',
    attemptCount: 'KEEP',
    lease: 'CLEAR',
    guards: [
      'ROW_LOCK',
      'SKIP_LOCKED',
      'PIPELINE_VERSION_RETIRED',
      'LEASE_EXPIRED_OR_NOT_LEASED',
      'SUPERSESSION_REASON_PIPELINE_RETIRED',
      'NO_SUCCESSOR',
      'CONTROL_PLANE_MAINTENANCE_ENABLED',
      'CONTROL_PLANE_DB_NOT_KILLED',
    ],
  },
  {
    id: 'T13_HOLDER_SUPERSEDE',
    from: ['LEASED'],
    to: 'SUPERSEDED',
    actor: 'LEASE_HOLDER',
    leaseEpoch: 'INCREMENT',
    attemptCount: 'KEEP',
    lease: 'CLEAR',
    guards: [
      'ROW_LOCK',
      'EPOCH_MATCH',
      'LEASE_NOT_EXPIRED_DB_CLOCK',
      'BOUNDARY_FINGERPRINT_CHANGED',
      'SUPERSESSION_REASON_SET',
      'SUPERSEDED_BY_POINTER_MUST_BE_NULL',
      'CONTROL_PLANE_WORKER_ENABLED',
      'CONTROL_PLANE_DB_NOT_KILLED',
    ],
  },
];

export const DI_V0_S4_KILL_GUARD = 'CONTROL_PLANE_DB_NOT_KILLED';
export const DI_V0_S4_WRITES_ALLOWED_WHILE_KILLED: readonly DiV0S4TransitionId[] = ['T07_FAIL_RETRYABLE'];

export type DiV0S4WriteId =
  | 'W_T01_WORK_ITEM_INSERT'
  | 'W_T02_CLAIM'
  | 'W_T03_HEARTBEAT'
  | 'W_T04_TAKEOVER'
  | 'W_T05_PIN_EVIDENCE_REF'
  | 'W_T06_COMPLETE_WITH_S2'
  | 'W_T07_SAFE_RELINQUISH'
  | 'W_T08_FAIL_TERMINAL'
  | 'W_T09_SKIP_INELIGIBLE'
  | 'W_T10_EXHAUST'
  | 'W_T11_SUPERSEDE'
  | 'W_T12_RETIRE'
  | 'W_T13_HOLDER_SUPERSEDE'
  | 'W_EVIDENCE_SNAPSHOT_INSERT'
  | 'W_S2_RUN_INSERT'
  | 'W_S2_INTERVAL_INSERT'
  | 'W_PIPELINE_REGISTRY_UPSERT'
  | 'W_SUCCESSOR_PRIMARY_INSERT'
  | 'W_CONTROL_ROW_OPERATOR_UPDATE';

export interface DiV0S4WriteSpec {
  writeId: DiV0S4WriteId;
  transitionId: DiV0S4TransitionId | null;
  boundTo: DiV0S4TransitionId | null;
  requiresActiveMaster: boolean;
  requiresDbNotKilled: boolean;
  requiresValidLease: boolean;
  requiresFence: boolean;
  requiresPipelineVersionMatch: boolean;
  allowedWhileKilled: boolean;
}

function w(
  writeId: DiV0S4WriteId,
  transitionId: DiV0S4TransitionId | null,
  boundTo: DiV0S4TransitionId | null,
  flags: [master: boolean, notKilled: boolean, lease: boolean, fence: boolean, pvk: boolean, whileKilled: boolean],
): DiV0S4WriteSpec {
  const [requiresActiveMaster, requiresDbNotKilled, requiresValidLease, requiresFence, requiresPipelineVersionMatch, allowedWhileKilled] = flags;
  return {
    writeId,
    transitionId,
    boundTo,
    requiresActiveMaster,
    requiresDbNotKilled,
    requiresValidLease,
    requiresFence,
    requiresPipelineVersionMatch,
    allowedWhileKilled,
  };
}

/** The complete authoritative S4 write set (contract `authoritativeWrites`, 19 classes). */
export const DI_V0_S4_AUTHORITATIVE_WRITES: readonly DiV0S4WriteSpec[] = [
  w('W_T01_WORK_ITEM_INSERT', 'T01_CREATE', null, [true, true, false, false, true, false]),
  w('W_T02_CLAIM', 'T02_CLAIM', null, [true, true, false, false, true, false]),
  w('W_T03_HEARTBEAT', 'T03_HEARTBEAT', null, [true, true, true, true, false, false]),
  w('W_T04_TAKEOVER', 'T04_TAKEOVER', null, [true, true, false, false, true, false]),
  w('W_T05_PIN_EVIDENCE_REF', 'T05_PIN', null, [true, true, true, true, false, false]),
  w('W_T06_COMPLETE_WITH_S2', 'T06_COMPLETE', null, [true, true, true, true, true, false]),
  w('W_T07_SAFE_RELINQUISH', 'T07_FAIL_RETRYABLE', null, [false, false, true, true, false, true]),
  w('W_T08_FAIL_TERMINAL', 'T08_FAIL_TERMINAL', null, [true, true, true, true, false, false]),
  w('W_T09_SKIP_INELIGIBLE', 'T09_SKIP_INELIGIBLE', null, [true, true, true, true, false, false]),
  w('W_T10_EXHAUST', 'T10_EXHAUST', null, [true, true, false, false, false, false]),
  w('W_T11_SUPERSEDE', 'T11_SUPERSEDE', null, [true, true, false, false, false, false]),
  w('W_T12_RETIRE', 'T12_RETIRE', null, [true, true, false, false, false, false]),
  w('W_T13_HOLDER_SUPERSEDE', 'T13_HOLDER_SUPERSEDE', null, [true, true, true, true, false, false]),
  w('W_EVIDENCE_SNAPSHOT_INSERT', null, 'T05_PIN', [true, true, true, true, false, false]),
  w('W_S2_RUN_INSERT', null, 'T06_COMPLETE', [true, true, true, true, true, false]),
  w('W_S2_INTERVAL_INSERT', null, 'T06_COMPLETE', [true, true, true, true, true, false]),
  w('W_PIPELINE_REGISTRY_UPSERT', null, 'T01_CREATE', [true, true, false, false, true, false]),
  w('W_SUCCESSOR_PRIMARY_INSERT', null, 'T11_SUPERSEDE', [true, true, false, false, true, false]),
  w('W_CONTROL_ROW_OPERATOR_UPDATE', null, null, [false, false, false, false, false, true]),
];

/**
 * Write class each repository method performs. W_CONTROL_ROW_OPERATOR_UPDATE has no code path:
 * the kill row is written only by the operator SQL runbook.
 */
export const DI_V0_S4_REPOSITORY_WRITE_MAP = {
  createWorkItem: ['W_PIPELINE_REGISTRY_UPSERT', 'W_T01_WORK_ITEM_INSERT'],
  claim: ['W_T02_CLAIM', 'W_T04_TAKEOVER'],
  heartbeat: ['W_T03_HEARTBEAT'],
  pinEvidence: ['W_EVIDENCE_SNAPSHOT_INSERT', 'W_T05_PIN_EVIDENCE_REF'],
  completeWithS2: ['W_S2_RUN_INSERT', 'W_S2_INTERVAL_INSERT', 'W_T06_COMPLETE_WITH_S2'],
  failRetryable: ['W_T07_SAFE_RELINQUISH'],
  failTerminal: ['W_T08_FAIL_TERMINAL'],
  skipIneligible: ['W_T09_SKIP_INELIGIBLE'],
  reapExhausted: ['W_T10_EXHAUST'],
  supersedeOnDrift: ['W_T11_SUPERSEDE', 'W_SUCCESSOR_PRIMARY_INSERT'],
  retirePipelineItems: ['W_T12_RETIRE'],
  retirePipelineVersion: ['W_T12_RETIRE'],
  holderSupersede: ['W_T13_HOLDER_SUPERSEDE'],
} as const satisfies Record<string, readonly DiV0S4WriteId[]>;

export type DiV0S4RepositoryWriteMethod = keyof typeof DI_V0_S4_REPOSITORY_WRITE_MAP;

export const DI_V0_S4_PIPELINE_MANIFEST_KEYS = [
  'boundaryFingerprintVersion',
  'calibrationBundleHash',
  'calibrationVersion',
  'channelEnablement',
  'channelPolicyVersion',
  'combinedInputIdentityVersion',
  'estimatorVersion',
  'evidenceSnapshotContainerVersion',
  'nativeAdapterVersion',
  'nativeSnapshotVersion',
  'positionAdapterVersion',
  'positionQuerySpecId',
  'positionSnapshotVersion',
  'r1AdapterVersion',
  'r1QuerySpecId',
  'r1SnapshotVersion',
  's4OrchestrationContractVersion',
  'shadowRecordVersion',
  'sourceFamilyPolicyVersion',
  'structuralVersion',
] as const;
export type DiV0S4PipelineManifestKey = (typeof DI_V0_S4_PIPELINE_MANIFEST_KEYS)[number];
export type DiV0S4PipelineManifest = Record<DiV0S4PipelineManifestKey, string>;

export const DI_V0_S4_EVIDENCE_CHANNEL_ORDER = ['NATIVE_EVENT', 'POSITION', 'R1_OBD'] as const;
export type DiV0S4EvidenceChannel = (typeof DI_V0_S4_EVIDENCE_CHANNEL_ORDER)[number];

export const DI_V0_S4_CHANNEL_OUTCOMES = {
  POSITION: ['PRESENT', 'SOURCE_FAILURE', 'AUTHORIZATION_FAILURE', 'INVALID_REQUEST', 'MALFORMED', 'UNSUPPORTED_SOURCE'],
  R1_OBD: ['PRESENT', 'PRESENT_SPARSE', 'SOURCE_FAILURE', 'NOT_APPLICABLE', 'DISABLED'],
  NATIVE_EVENT: ['READY_WITH_EVENTS', 'READY_NO_EVENT', 'NOT_READY', 'SOURCE_FAILURE', 'NOT_APPLICABLE', 'DISABLED', 'CONTEXT_REJECTED'],
} as const satisfies Record<DiV0S4EvidenceChannel, readonly string[]>;

export const DI_V0_S4_CHANNEL_RULES = {
  positionRunnableOutcomes: ['PRESENT'],
  snapshotRequiredOutcomes: ['PRESENT', 'PRESENT_SPARSE', 'READY_WITH_EVENTS', 'READY_NO_EVENT', 'CONTEXT_REJECTED'],
  snapshotForbiddenOutcomes: ['NOT_APPLICABLE', 'DISABLED', 'NOT_READY'],
  reasonCodeRequiredOutcomes: [
    'SOURCE_FAILURE',
    'AUTHORIZATION_FAILURE',
    'INVALID_REQUEST',
    'MALFORMED',
    'UNSUPPORTED_SOURCE',
    'NOT_READY',
    'NOT_APPLICABLE',
    'DISABLED',
    'CONTEXT_REJECTED',
  ],
  nativeReadyOutcomesRequireAttestation: ['READY_WITH_EVENTS', 'READY_NO_EVENT'],
  channelPolicyV1ReachableNativeOutcomes: ['NOT_READY', 'NOT_APPLICABLE', 'DISABLED', 'SOURCE_FAILURE', 'CONTEXT_REJECTED'],
  channelPolicyV1R1ApplicableFamilies: ['RUPTELA_R1'],
  channelPolicyV1NativeApplicableFamilies: ['RUPTELA_R1'],
  channelEvidenceHashPattern: /^[A-Z0-9_]+:sha256:[0-9a-f]+$/,
} as const;

/** Every identity hash excludes these (contract `identity.excludedFromEveryHash`). */
export const DI_V0_S4_HASH_FORBIDDEN_FIELDS = [
  'createdAt',
  'updatedAt',
  'leaseOwner',
  'leaseEpoch',
  'workerId',
  'hostname',
  'attemptCount',
  'acquiredAtWallClock',
  'bullmqJobId',
  'workItemId',
] as const;
