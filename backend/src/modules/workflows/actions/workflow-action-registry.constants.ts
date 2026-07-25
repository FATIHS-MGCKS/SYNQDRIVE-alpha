import type {
  WorkflowActionIdempotencyPolicy,
  WorkflowActionRetryPolicy,
  WorkflowActionRiskClass,
  WorkflowActionTimeoutPolicy,
} from './workflow-action-registry.types';

export const WORKFLOW_ACTION_HANDLERS = Symbol('WORKFLOW_ACTION_HANDLERS');

export const DEFAULT_ACTION_TIMEOUT: WorkflowActionTimeoutPolicy = {
  defaultMs: 120_000,
  maxMs: 600_000,
};

export const DEFAULT_ACTION_RETRY: WorkflowActionRetryPolicy = {
  maxAttempts: 3,
  initialBackoffMs: 30_000,
  maxBackoffMs: 900_000,
  retryableCategories: ['TRANSIENT'],
};

export const DEFAULT_IDEMPOTENCY_POLICY: WorkflowActionIdempotencyPolicy = {
  scope: 'action_run',
  keyField: 'idempotencyKey',
};

export const RISK_CLASS_RANK: Record<WorkflowActionRiskClass, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};
