import type { WorkflowRuntimeStatusActorType } from '@prisma/client';
import type { WorkflowRuntimeActor } from '../workflow-runtime-status.types';

export const WORKFLOW_CANCELLATION_ERROR_CODES = {
  NOT_FOUND: 'WORKFLOW_RUN_NOT_FOUND',
  TENANT_VIOLATION: 'WORKFLOW_RUNTIME_TENANT_VIOLATION',
  ALREADY_TERMINAL: 'WORKFLOW_RUN_ALREADY_TERMINAL',
  LOCK_CONFLICT: 'WORKFLOW_RUNTIME_LOCK_CONFLICT',
  ORG_LOCKED: 'WORKFLOW_ORG_LOCKED',
  PROVIDER_STATE_UNKNOWN: 'WORKFLOW_PROVIDER_STATE_UNKNOWN',
} as const;

export type WorkflowCancellationSource =
  | 'USER_REQUEST'
  | 'SYSTEM_POLICY'
  | 'MAX_RUN_DURATION'
  | 'ORG_ARCHIVED'
  | 'ORG_SUSPENDED';

export interface WorkflowRunCancelInput {
  organizationId: string;
  runId: string;
  actor: WorkflowRuntimeActor;
  reason: string;
  source: WorkflowCancellationSource;
  userId?: string;
  expectedLockVersion?: number;
}

export interface WorkflowRunCancelResult {
  runId: string;
  status: 'CANCELLED';
  cancelledAt: string;
  cancelledActions: number;
  providerUnclearActions: number;
  cancelledApprovals: number;
  cancelledTimers: number;
  source: WorkflowCancellationSource;
}

export interface WorkflowRunStatusView {
  id: string;
  organizationId: string;
  status: string;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  startedAt: string;
  finishedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledByActorType: WorkflowRuntimeStatusActorType | null;
  errorMessage: string | null;
  actionSummary: {
    total: number;
    succeeded: number;
    cancelled: number;
    failed: number;
    pending: number;
  };
}
