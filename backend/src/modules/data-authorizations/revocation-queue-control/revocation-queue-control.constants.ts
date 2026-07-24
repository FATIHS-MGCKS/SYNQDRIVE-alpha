export const WORKER_POLICY_ENGINE_VERSION = '2026-07-prompt27-v1';

export const REVOCATION_CHECKPOINT = {
  PRE_PERSIST: 'pre_persist',
  PRE_EXTERNAL: 'pre_external',
  PRE_ENQUEUE: 'pre_enqueue',
} as const;

export type RevocationCheckpoint =
  (typeof REVOCATION_CHECKPOINT)[keyof typeof REVOCATION_CHECKPOINT];

export const REVOCATION_CHECKPOINT_REASON = {
  DENY_SWITCH_ACTIVE: 'DENY_SWITCH_ACTIVE',
  POLICY_DENIED: 'POLICY_DENIED',
  ORG_SCOPE_MISMATCH: 'ORG_SCOPE_MISMATCH',
  SCHEDULER_PAUSED: 'SCHEDULER_PAUSED',
  WORKER_POLICY_ENGINE_OUTDATED: 'WORKER_POLICY_ENGINE_OUTDATED',
} as const;

export type RevocationCheckpointReason =
  (typeof REVOCATION_CHECKPOINT_REASON)[keyof typeof REVOCATION_CHECKPOINT_REASON];

export function buildQueueActionIdempotencyKey(parts: {
  workflowId: string;
  queueName: string;
  jobId: string;
  action: string;
}): string {
  return `revocation-queue:${parts.workflowId}:${parts.queueName}:${parts.jobId}:${parts.action}`;
}

export function buildSchedulerPauseIdempotencyKey(parts: {
  organizationId: string;
  schedulerKey: string;
  correlationId: string;
}): string {
  return `revocation-scheduler-pause:${parts.organizationId}:${parts.schedulerKey}:${parts.correlationId}`;
}

export function buildDownstreamNotifyIdempotencyKey(parts: {
  workflowId: string;
  recipient: string;
  channel: string;
}): string {
  return `revocation-downstream:${parts.workflowId}:${parts.channel}:${parts.recipient}`;
}
