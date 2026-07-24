import { WorkflowStatus } from '@prisma/client';

/** Statuses that may trigger new LIVE workflow runs. */
export const WORKFLOW_RUNNABLE_STATUSES: WorkflowStatus[] = ['ACTIVE'];

/** Default list filter — operational workflows only. */
export const WORKFLOW_LIST_DEFAULT_STATUSES: WorkflowStatus[] = [
  'DRAFT',
  'PUBLISHED',
  'ACTIVE',
  'DISABLED',
  'INVALID',
];

export function isWorkflowArchived(status: WorkflowStatus): boolean {
  return status === 'ARCHIVED';
}

export function isWorkflowRunnable(status: WorkflowStatus, enabled: boolean): boolean {
  return enabled && WORKFLOW_RUNNABLE_STATUSES.includes(status);
}

export function wasEverPublished(input: {
  publishedAt?: Date | null;
  triggerCount?: number;
  status?: WorkflowStatus;
}): boolean {
  if (input.publishedAt) return true;
  if ((input.triggerCount ?? 0) > 0) return true;
  return (
    input.status === 'ACTIVE' ||
    input.status === 'DISABLED' ||
    input.status === 'PUBLISHED' ||
    input.status === 'INVALID'
  );
}

export function requiresArchiveReason(input: {
  publishedAt?: Date | null;
  triggerCount?: number;
  runCount?: number;
}): boolean {
  return (
    wasEverPublished(input) ||
    (input.triggerCount ?? 0) > 0 ||
    (input.runCount ?? 0) > 0
  );
}

export function canDiscardDraft(input: {
  status: WorkflowStatus;
  publishedAt?: Date | null;
  triggerCount?: number;
  runCount?: number;
}): boolean {
  return (
    input.status === 'DRAFT' &&
    !input.publishedAt &&
    (input.triggerCount ?? 0) === 0 &&
    (input.runCount ?? 0) === 0
  );
}
