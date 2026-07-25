import type { WorkflowActionRun, WorkflowPolicySnapshot, WorkflowRun } from '@prisma/client';
import type { WorkflowRuntimeActor } from './workflow-runtime-status.types';
import type { WorkflowActionRunStatus } from './workflow-runtime-status.constants';

export const WORKFLOW_ACTION_ERROR_CATEGORIES = [
  'RETRYABLE',
  'PERMANENT',
  'TIMEOUT',
  'PROVIDER_UNCLEAR',
  'VALIDATION',
  'TENANT_VIOLATION',
  'APPROVAL_REQUIRED',
] as const;

export type WorkflowActionErrorCategory = (typeof WORKFLOW_ACTION_ERROR_CATEGORIES)[number];

export interface WorkflowActionRunEventContext {
  eventId: string;
  eventType: string;
  eventVersion: string;
  entityType: string | null;
  entityId: string | null;
  correlationId: string | null;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface WorkflowActionRunPolicyContext {
  policySnapshotId: string;
  capabilityRevision: string;
  approvalResumeSupported: boolean;
  approvalTtlHours: number;
  maxActionAttempts: number;
  actionTimeoutMs: number;
}

export interface WorkflowActionExecutionContext {
  organizationId: string;
  actor: WorkflowRuntimeActor;
  run: WorkflowRun;
  actionRun: WorkflowActionRun;
  event: WorkflowActionRunEventContext;
  policy: WorkflowActionRunPolicyContext;
  /** Action definition from frozen run snapshot — never live workflow version. */
  actionSnapshot: WorkflowActionSnapshotEntry;
}

export interface WorkflowActionSnapshotEntry {
  actionKey: string;
  actionIndex: number;
  actionType: string;
  workflowActionId: string | null;
  requiresApproval: boolean;
  blockingOnFailure: boolean;
  config: Record<string, unknown>;
}

export interface WorkflowActionExecutionResult {
  status: WorkflowActionRunStatus;
  resultSummary?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorCode?: string;
  errorCategory?: WorkflowActionErrorCategory;
  errorSummary?: string;
  providerReference?: string;
  waitingUntil?: Date;
  idempotentReplay?: boolean;
}

export function buildPolicyContext(
  snapshot: WorkflowPolicySnapshot,
  defaults: { maxActionAttempts: number; actionTimeoutMs: number },
): WorkflowActionRunPolicyContext {
  return {
    policySnapshotId: snapshot.id,
    capabilityRevision: snapshot.capabilityRevision,
    approvalResumeSupported: snapshot.approvalResumeSupported,
    approvalTtlHours: snapshot.approvalTtlHours,
    maxActionAttempts: defaults.maxActionAttempts,
    actionTimeoutMs: defaults.actionTimeoutMs,
  };
}

export function buildEventContext(run: WorkflowRun): WorkflowActionRunEventContext {
  const payload =
    run.inputPayload && typeof run.inputPayload === 'object' && !Array.isArray(run.inputPayload)
      ? (run.inputPayload as Record<string, unknown>)
      : {};
  return {
    eventId: run.correlationId ?? run.id,
    eventType: run.eventType,
    eventVersion: '1.0.0',
    entityType: run.entityType,
    entityId: run.entityId,
    correlationId: run.correlationId,
    occurredAt: run.startedAt.toISOString(),
    payload,
  };
}
