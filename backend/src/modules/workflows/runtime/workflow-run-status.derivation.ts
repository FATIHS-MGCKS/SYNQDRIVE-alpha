import {
  type WorkflowActionRunStatus,
  type WorkflowRunStatus,
  TERMINAL_WORKFLOW_ACTION_RUN_STATUSES,
  TERMINAL_WORKFLOW_RUN_STATUSES,
  SUCCESSFUL_ACTION_RUN_STATUSES,
} from './workflow-runtime-status.constants';

const ACTIVE_ACTION_STATUSES = new Set<WorkflowActionRunStatus>([
  'PENDING',
  'RUNNING',
  'WAITING',
  'WAITING_FOR_APPROVAL',
  'FAILED_RETRYABLE',
]);

/**
 * Derives the aggregate workflow run status from action run statuses.
 * Returns null when actions are still active and the run should remain non-terminal.
 */
export function deriveWorkflowRunStatusFromActions(
  actionStatuses: WorkflowActionRunStatus[],
): WorkflowRunStatus | null {
  if (actionStatuses.length === 0) {
    return null;
  }

  if (actionStatuses.some((status) => ACTIVE_ACTION_STATUSES.has(status))) {
    if (actionStatuses.includes('WAITING_FOR_APPROVAL')) {
      return 'WAITING_FOR_APPROVAL';
    }
    if (actionStatuses.includes('WAITING')) {
      return 'WAITING';
    }
    return 'RUNNING';
  }

  const succeeded = actionStatuses.filter((s) => SUCCESSFUL_ACTION_RUN_STATUSES.has(s)).length;
  const skipped = actionStatuses.filter((s) => s === 'SKIPPED').length;
  const failedPermanent = actionStatuses.filter((s) => s === 'FAILED_PERMANENT').length;
  const cancelled = actionStatuses.filter((s) => s === 'CANCELLED').length;

  if (actionStatuses.every((s) => s === 'SKIPPED')) {
    return 'SKIPPED';
  }

  if (cancelled === actionStatuses.length) {
    return 'CANCELLED';
  }

  if (succeeded > 0 && failedPermanent > 0) {
    return 'PARTIALLY_COMPLETED';
  }

  if (succeeded > 0 && failedPermanent === 0) {
    const nonSkipped = actionStatuses.filter((s) => s !== 'SKIPPED');
    if (nonSkipped.every((s) => SUCCESSFUL_ACTION_RUN_STATUSES.has(s))) {
      return 'COMPLETED';
    }
  }

  if (succeeded === 0 && failedPermanent > 0) {
    return 'FAILED';
  }

  if (succeeded === 0 && failedPermanent === 0 && cancelled > 0) {
    return 'CANCELLED';
  }

  return 'FAILED';
}

export function isTerminalWorkflowRunStatus(status: WorkflowRunStatus): boolean {
  return TERMINAL_WORKFLOW_RUN_STATUSES.has(status);
}

export function isTerminalWorkflowActionRunStatus(status: WorkflowActionRunStatus): boolean {
  return TERMINAL_WORKFLOW_ACTION_RUN_STATUSES.has(status);
}

export function countSuccessfulActions(actionStatuses: WorkflowActionRunStatus[]): number {
  return actionStatuses.filter((s) => SUCCESSFUL_ACTION_RUN_STATUSES.has(s)).length;
}
