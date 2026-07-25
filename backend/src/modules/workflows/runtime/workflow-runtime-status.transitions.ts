import { BadRequestException } from '@nestjs/common';
import { WORKFLOW_RUNTIME_STATUS_ERROR_CODES } from './workflow-runtime-status.errors';
import {
  WORKFLOW_ACTION_RUN_STATUSES,
  WORKFLOW_RUN_STATUSES,
  type WorkflowActionRunStatus,
  type WorkflowRunStatus,
  TERMINAL_WORKFLOW_ACTION_RUN_STATUSES,
  TERMINAL_WORKFLOW_RUN_STATUSES,
} from './workflow-runtime-status.constants';

export interface WorkflowStatusTransitionResult {
  allowed: true;
}

export interface WorkflowStatusTransitionRejection {
  allowed: false;
  code: string;
  message: string;
}

export type WorkflowStatusTransitionDecision =
  | WorkflowStatusTransitionResult
  | WorkflowStatusTransitionRejection;

const RUN_TRANSITIONS: Record<WorkflowRunStatus, readonly WorkflowRunStatus[]> = {
  PENDING: ['RUNNING', 'SKIPPED', 'CANCELLED'],
  RUNNING: [
    'WAITING',
    'WAITING_FOR_APPROVAL',
    'COMPLETED',
    'PARTIALLY_COMPLETED',
    'FAILED',
    'CANCELLED',
    'SKIPPED',
  ],
  WAITING: ['RUNNING', 'FAILED', 'CANCELLED'],
  WAITING_FOR_APPROVAL: ['RUNNING', 'FAILED', 'CANCELLED'],
  COMPLETED: [],
  PARTIALLY_COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
  SKIPPED: [],
};

const ACTION_TRANSITIONS: Record<WorkflowActionRunStatus, readonly WorkflowActionRunStatus[]> = {
  PENDING: ['RUNNING', 'SKIPPED', 'CANCELLED'],
  RUNNING: [
    'WAITING',
    'WAITING_FOR_APPROVAL',
    'SUCCEEDED',
    'FAILED_RETRYABLE',
    'FAILED_PERMANENT',
    'CANCELLED',
    'SKIPPED',
  ],
  WAITING: ['RUNNING', 'FAILED_PERMANENT', 'CANCELLED'],
  WAITING_FOR_APPROVAL: ['RUNNING', 'FAILED_PERMANENT', 'CANCELLED'],
  FAILED_RETRYABLE: ['RUNNING', 'FAILED_PERMANENT'],
  SUCCEEDED: [],
  FAILED_PERMANENT: [],
  CANCELLED: [],
  SKIPPED: [],
};

function reject(code: string, message: string): WorkflowStatusTransitionRejection {
  return { allowed: false, code, message };
}

export function assertWorkflowRunTransition(
  from: WorkflowRunStatus,
  to: WorkflowRunStatus,
): WorkflowStatusTransitionDecision {
  if (from === to) {
    return reject(
      WORKFLOW_RUNTIME_STATUS_ERROR_CODES.NOOP_TRANSITION,
      'Workflow run is already in the requested status',
    );
  }
  if (TERMINAL_WORKFLOW_RUN_STATUSES.has(from)) {
    return reject(
      WORKFLOW_RUNTIME_STATUS_ERROR_CODES.TERMINAL_IMMUTABLE,
      `Terminal workflow run status ${from} cannot transition`,
    );
  }
  if (!RUN_TRANSITIONS[from]?.includes(to)) {
    return reject(
      WORKFLOW_RUNTIME_STATUS_ERROR_CODES.INVALID_TRANSITION,
      `Workflow run cannot transition from ${from} to ${to}`,
    );
  }
  return { allowed: true };
}

export function assertWorkflowActionRunTransition(
  from: WorkflowActionRunStatus,
  to: WorkflowActionRunStatus,
): WorkflowStatusTransitionDecision {
  if (from === to) {
    return reject(
      WORKFLOW_RUNTIME_STATUS_ERROR_CODES.NOOP_TRANSITION,
      'Workflow action run is already in the requested status',
    );
  }
  if (TERMINAL_WORKFLOW_ACTION_RUN_STATUSES.has(from)) {
    return reject(
      WORKFLOW_RUNTIME_STATUS_ERROR_CODES.TERMINAL_IMMUTABLE,
      `Terminal action run status ${from} cannot transition`,
    );
  }
  if (!ACTION_TRANSITIONS[from]?.includes(to)) {
    return reject(
      WORKFLOW_RUNTIME_STATUS_ERROR_CODES.INVALID_TRANSITION,
      `Workflow action run cannot transition from ${from} to ${to}`,
    );
  }
  return { allowed: true };
}

export function assertWorkflowRunTransitionOrThrow(
  from: WorkflowRunStatus,
  to: WorkflowRunStatus,
): void {
  const decision = assertWorkflowRunTransition(from, to);
  if (!decision.allowed) {
    throw new BadRequestException({
      message: decision.message,
      code: decision.code,
      from,
      to,
    });
  }
}

export function assertWorkflowActionRunTransitionOrThrow(
  from: WorkflowActionRunStatus,
  to: WorkflowActionRunStatus,
): void {
  const decision = assertWorkflowActionRunTransition(from, to);
  if (!decision.allowed) {
    throw new BadRequestException({
      message: decision.message,
      code: decision.code,
      from,
      to,
    });
  }
}

export function listAllowedWorkflowRunTransitions(from: WorkflowRunStatus) {
  return [...(RUN_TRANSITIONS[from] ?? [])];
}

export function listAllowedWorkflowActionRunTransitions(from: WorkflowActionRunStatus) {
  return [...(ACTION_TRANSITIONS[from] ?? [])];
}

export function buildWorkflowRunTransitionMatrix() {
  return WORKFLOW_RUN_STATUSES.flatMap((from) =>
    WORKFLOW_RUN_STATUSES.map((to) => ({
      from,
      to,
      allowed: assertWorkflowRunTransition(from, to).allowed,
    })),
  );
}

export function buildWorkflowActionRunTransitionMatrix() {
  return WORKFLOW_ACTION_RUN_STATUSES.flatMap((from) =>
    WORKFLOW_ACTION_RUN_STATUSES.map((to) => ({
      from,
      to,
      allowed: assertWorkflowActionRunTransition(from, to).allowed,
    })),
  );
}
