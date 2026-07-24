import type { DataAuthorizationRevocationWorkflowStatus } from '@prisma/client';

export const REVOCATION_ORCHESTRATOR = {
  payloadVersion: 1,
  pollBatchSize: 25,
  maxAttempts: 8,
  backoffMs: 2_000,
  staleProcessingMs: 180_000,
} as const;

export const REVOCATION_STEP_KEY = {
  DENY_SWITCH: 'deny_switch',
  STOP_INGESTION: 'stop_ingestion',
  REVOKE_PROVIDER: 'revoke_provider',
  CANCEL_QUEUES: 'cancel_queues',
  NOTIFY_PARTNER: 'notify_partner',
  RETENTION_DECISION: 'retention_decision',
  SCHEDULE_DELETION: 'schedule_deletion',
  VERIFY: 'verify',
} as const;

export type RevocationStepKey =
  (typeof REVOCATION_STEP_KEY)[keyof typeof REVOCATION_STEP_KEY];

export const REVOCATION_RETENTION_DECISION = {
  RETAIN: 'RETAIN',
  DELETE: 'DELETE',
  LEGAL_HOLD: 'LEGAL_HOLD',
} as const;

export type RevocationRetentionDecision =
  (typeof REVOCATION_RETENTION_DECISION)[keyof typeof REVOCATION_RETENTION_DECISION];

/** Target workflow status after each step completes successfully. */
export const REVOCATION_STEP_TARGET_STATUS: Record<
  RevocationStepKey,
  DataAuthorizationRevocationWorkflowStatus
> = {
  [REVOCATION_STEP_KEY.DENY_SWITCH]: 'DENY_SWITCH_ACTIVE',
  [REVOCATION_STEP_KEY.STOP_INGESTION]: 'INGESTION_STOPPED',
  [REVOCATION_STEP_KEY.REVOKE_PROVIDER]: 'PROVIDER_ACCESS_REVOKED',
  [REVOCATION_STEP_KEY.CANCEL_QUEUES]: 'QUEUES_CANCELLED',
  [REVOCATION_STEP_KEY.NOTIFY_PARTNER]: 'DOWNSTREAM_NOTIFIED',
  [REVOCATION_STEP_KEY.RETENTION_DECISION]: 'RETENTION_DECIDED',
  [REVOCATION_STEP_KEY.SCHEDULE_DELETION]: 'DELETION_SCHEDULED',
  [REVOCATION_STEP_KEY.VERIFY]: 'REVOCATION_COMPLETE',
};

/** Pending marker status set immediately before attempting async steps. */
export const REVOCATION_STEP_PENDING_STATUS: Partial<
  Record<RevocationStepKey, DataAuthorizationRevocationWorkflowStatus>
> = {
  [REVOCATION_STEP_KEY.REVOKE_PROVIDER]: 'PROVIDER_ACCESS_REVOKE_PENDING',
  [REVOCATION_STEP_KEY.NOTIFY_PARTNER]: 'DOWNSTREAM_NOTIFICATION_PENDING',
  [REVOCATION_STEP_KEY.RETENTION_DECISION]: 'RETENTION_DECISION_PENDING',
  [REVOCATION_STEP_KEY.VERIFY]: 'VERIFICATION_PENDING',
};

export const TERMINAL_REVOCATION_STATUSES = new Set<DataAuthorizationRevocationWorkflowStatus>([
  'REVOCATION_COMPLETE',
  'REVOCATION_FAILED',
]);

export function buildRevocationIdempotencyKey(parts: {
  organizationId: string;
  triggerType: string;
  entityId: string;
  mutationVersion?: number | string;
}): string {
  const version = parts.mutationVersion ?? 'v1';
  return `data-auth-revocation:${parts.organizationId}:${parts.triggerType}:${parts.entityId}:${version}`;
}

export function computeRevocationBackoffMs(attempt: number): number {
  return REVOCATION_ORCHESTRATOR.backoffMs * Math.pow(2, Math.max(0, attempt - 1));
}
