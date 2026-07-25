import { BadRequestException } from '@nestjs/common';
import {
  type WorkflowActionRunStatus,
  type WorkflowRunStatus,
  TERMINAL_WORKFLOW_ACTION_RUN_STATUSES,
  TERMINAL_WORKFLOW_RUN_STATUSES,
} from './workflow-runtime-status.constants';
import { WORKFLOW_RUNTIME_STATUS_ERROR_CODES } from './workflow-runtime-status.errors';

export interface WorkflowRunStatusFieldPatch {
  waitingUntil?: Date | null;
  approvalId?: string | null;
  finishedAt?: Date | null;
}

export interface WorkflowActionRunStatusFieldPatch {
  waitingUntil?: Date | null;
  approvalId?: string | null;
  finishedAt?: Date | null;
  attemptCount?: number;
  nextAttemptAt?: Date | null;
}

export function buildWorkflowRunStatusFields(
  to: WorkflowRunStatus,
  input: {
    waitingUntil?: Date | null;
    approvalId?: string | null;
    now?: Date;
  },
): WorkflowRunStatusFieldPatch {
  const now = input.now ?? new Date();
  const terminal = TERMINAL_WORKFLOW_RUN_STATUSES.has(to);

  if (to === 'WAITING') {
    if (!input.waitingUntil) {
      throw fieldRuleViolation('waitingUntil is required when status is WAITING');
    }
    return {
      waitingUntil: input.waitingUntil,
      approvalId: null,
      finishedAt: null,
    };
  }

  if (to === 'WAITING_FOR_APPROVAL') {
    if (!input.approvalId) {
      throw fieldRuleViolation('approvalId is required when status is WAITING_FOR_APPROVAL');
    }
    return {
      waitingUntil: null,
      approvalId: input.approvalId,
      finishedAt: null,
    };
  }

  return {
    waitingUntil: null,
    approvalId: null,
    finishedAt: terminal ? now : null,
  };
}

export function buildWorkflowActionRunStatusFields(
  from: WorkflowActionRunStatus,
  to: WorkflowActionRunStatus,
  input: {
    waitingUntil?: Date | null;
    approvalId?: string | null;
    nextAttemptAt?: Date | null;
    attemptCount?: number;
    now?: Date;
  },
): WorkflowActionRunStatusFieldPatch {
  const now = input.now ?? new Date();
  const terminal = TERMINAL_WORKFLOW_ACTION_RUN_STATUSES.has(to);
  const baseAttemptCount = input.attemptCount ?? 0;

  if (to === 'WAITING') {
    if (!input.waitingUntil) {
      throw fieldRuleViolation('waitingUntil is required when status is WAITING');
    }
    return {
      waitingUntil: input.waitingUntil,
      approvalId: null,
      finishedAt: null,
      attemptCount: baseAttemptCount,
      nextAttemptAt: null,
    };
  }

  if (to === 'WAITING_FOR_APPROVAL') {
    if (!input.approvalId) {
      throw fieldRuleViolation('approvalId is required when status is WAITING_FOR_APPROVAL');
    }
    return {
      waitingUntil: null,
      approvalId: input.approvalId,
      finishedAt: null,
      attemptCount: baseAttemptCount,
      nextAttemptAt: null,
    };
  }

  if (to === 'FAILED_RETRYABLE') {
    return {
      waitingUntil: null,
      approvalId: null,
      finishedAt: null,
      attemptCount: baseAttemptCount + 1,
      nextAttemptAt: input.nextAttemptAt ?? null,
    };
  }

  if (to === 'RUNNING' && from === 'FAILED_RETRYABLE') {
    return {
      waitingUntil: null,
      approvalId: null,
      finishedAt: null,
      attemptCount: baseAttemptCount,
      nextAttemptAt: null,
    };
  }

  return {
    waitingUntil: null,
    approvalId: null,
    finishedAt: terminal ? now : null,
    attemptCount: baseAttemptCount,
    nextAttemptAt: null,
  };
}

function fieldRuleViolation(message: string): never {
  throw new BadRequestException({
    message,
    code: WORKFLOW_RUNTIME_STATUS_ERROR_CODES.FIELD_RULE_VIOLATION,
  });
}
