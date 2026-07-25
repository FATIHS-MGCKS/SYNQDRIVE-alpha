import {
  WorkflowRuntimeActionRunStatus,
  WorkflowRuntimeRunStatus,
} from '@prisma/client';

export const WORKFLOW_RUN_STATUSES = [
  'PENDING',
  'RUNNING',
  'WAITING',
  'WAITING_FOR_APPROVAL',
  'COMPLETED',
  'COMPLETED_WITH_FALLBACK',
  'PARTIALLY_COMPLETED',
  'FAILED',
  'CANCELLED',
  'SKIPPED',
] as const satisfies readonly WorkflowRuntimeRunStatus[];

export const WORKFLOW_ACTION_RUN_STATUSES = [
  'PENDING',
  'RUNNING',
  'WAITING',
  'WAITING_FOR_APPROVAL',
  'SUCCEEDED',
  'FAILED_RETRYABLE',
  'FAILED_PERMANENT',
  'CANCELLED',
  'SKIPPED',
] as const satisfies readonly WorkflowRuntimeActionRunStatus[];

export type WorkflowRunStatus = (typeof WORKFLOW_RUN_STATUSES)[number];
export type WorkflowActionRunStatus = (typeof WORKFLOW_ACTION_RUN_STATUSES)[number];

export const TERMINAL_WORKFLOW_RUN_STATUSES = new Set<WorkflowRunStatus>([
  'COMPLETED',
  'COMPLETED_WITH_FALLBACK',
  'PARTIALLY_COMPLETED',
  'FAILED',
  'CANCELLED',
  'SKIPPED',
]);

export const TERMINAL_WORKFLOW_ACTION_RUN_STATUSES = new Set<WorkflowActionRunStatus>([
  'SUCCEEDED',
  'FAILED_PERMANENT',
  'CANCELLED',
  'SKIPPED',
]);

export const SUCCESSFUL_ACTION_RUN_STATUSES = new Set<WorkflowActionRunStatus>(['SUCCEEDED']);

export const ACTIVE_WORKFLOW_RUN_STATUSES = new Set<WorkflowRunStatus>([
  'RUNNING',
  'WAITING',
  'WAITING_FOR_APPROVAL',
]);

export const ACTIVE_WORKFLOW_ACTION_RUN_STATUSES = new Set<WorkflowActionRunStatus>([
  'RUNNING',
  'WAITING',
  'WAITING_FOR_APPROVAL',
  'FAILED_RETRYABLE',
]);
