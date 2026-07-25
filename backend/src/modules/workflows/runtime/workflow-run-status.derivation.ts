import {
  type WorkflowActionRunStatus,
  type WorkflowRunStatus,
  TERMINAL_WORKFLOW_ACTION_RUN_STATUSES,
  SUCCESSFUL_ACTION_RUN_STATUSES,
} from './workflow-runtime-status.constants';

const ACTIVE_ACTION_STATUSES = new Set<WorkflowActionRunStatus>([
  'PENDING',
  'RUNNING',
  'WAITING',
  'WAITING_FOR_APPROVAL',
  'FAILED_RETRYABLE',
]);

export interface WorkflowActionRunDerivationInput {
  status: WorkflowActionRunStatus;
  blockingOnFailure: boolean;
  partialFailure: boolean;
  isFallbackRun: boolean;
}

/**
 * Derives the aggregate workflow run status from action run states.
 * Returns null when actions are still active and the run should remain non-terminal.
 */
export function deriveWorkflowRunStatusFromActions(
  actions: WorkflowActionRunDerivationInput[] | WorkflowActionRunStatus[],
): WorkflowRunStatus | null {
  const normalized: WorkflowActionRunDerivationInput[] = actions.map((entry) =>
    typeof entry === 'string'
      ? {
          status: entry,
          blockingOnFailure: true,
          partialFailure: false,
          isFallbackRun: false,
        }
      : entry,
  );

  if (normalized.length === 0) {
    return null;
  }

  const statuses = normalized.map((a) => a.status);

  if (statuses.some((status) => ACTIVE_ACTION_STATUSES.has(status))) {
    if (statuses.includes('WAITING_FOR_APPROVAL')) {
      return 'WAITING_FOR_APPROVAL';
    }
    if (statuses.includes('WAITING')) {
      return 'WAITING';
    }
    return 'RUNNING';
  }

  const succeeded = statuses.filter((s) => SUCCESSFUL_ACTION_RUN_STATUSES.has(s)).length;
  const skipped = statuses.filter((s) => s === 'SKIPPED').length;
  const failedPermanent = statuses.filter((s) => s === 'FAILED_PERMANENT').length;
  const cancelled = statuses.filter((s) => s === 'CANCELLED').length;
  const partialFailures = normalized.filter((a) => a.partialFailure).length;
  const fallbackSucceeded = normalized.some(
    (a) => a.isFallbackRun && a.status === 'SUCCEEDED',
  );
  const blockingFailures = normalized.filter(
    (a) => a.status === 'FAILED_PERMANENT' && a.blockingOnFailure,
  ).length;

  if (statuses.every((s) => s === 'SKIPPED')) {
    return 'SKIPPED';
  }

  if (cancelled === statuses.length) {
    return 'CANCELLED';
  }

  if (blockingFailures > 0) {
    return 'FAILED';
  }

  if (fallbackSucceeded && (failedPermanent > 0 || skipped > 0 || partialFailures > 0)) {
    const nonFallbackSucceeded = normalized.filter(
      (a) => !a.isFallbackRun && a.status === 'SUCCEEDED',
    ).length;
    if (nonFallbackSucceeded > 0 || succeeded > 0) {
      return 'COMPLETED_WITH_FALLBACK';
    }
  }

  if (succeeded > 0 && (failedPermanent > 0 || partialFailures > 0)) {
    return 'PARTIALLY_COMPLETED';
  }

  if (succeeded > 0 && failedPermanent === 0) {
    const nonSkipped = statuses.filter((s) => s !== 'SKIPPED');
    if (nonSkipped.every((s) => SUCCESSFUL_ACTION_RUN_STATUSES.has(s))) {
      return fallbackSucceeded ? 'COMPLETED_WITH_FALLBACK' : 'COMPLETED';
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
  return [
    'COMPLETED',
    'COMPLETED_WITH_FALLBACK',
    'PARTIALLY_COMPLETED',
    'FAILED',
    'CANCELLED',
    'SKIPPED',
  ].includes(status);
}

export function isTerminalWorkflowActionRunStatus(status: WorkflowActionRunStatus): boolean {
  return TERMINAL_WORKFLOW_ACTION_RUN_STATUSES.has(status);
}

export function countSuccessfulActions(actionStatuses: WorkflowActionRunStatus[]): number {
  return actionStatuses.filter((s) => SUCCESSFUL_ACTION_RUN_STATUSES.has(s)).length;
}
