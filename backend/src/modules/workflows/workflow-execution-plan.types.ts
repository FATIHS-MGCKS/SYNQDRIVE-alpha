import type { WorkflowExecutionMode } from './workflow-execution-mode';

export type WorkflowActionRiskClass = 'INTERNAL' | 'EXTERNAL' | 'HUMAN' | 'UNKNOWN';

export interface WorkflowConditionPlanResult {
  path: string;
  operator: string;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
}

export interface WorkflowScopePlanResult {
  passed: boolean;
  scopeType: string;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface WorkflowPlannedAction {
  index: number;
  actionType: string;
  riskClass: WorkflowActionRiskClass;
  requiresApproval: boolean;
  status: 'PLANNED' | 'SKIPPED' | 'BLOCKED' | 'ERROR';
  policyBlockers: string[];
  resolvedRecipients?: Array<{ channel: string; masked: string }>;
  preview?: Record<string, unknown>;
  validationErrors: string[];
  expectedFallback?: string;
  skipReason?: string;
}

export interface WorkflowExecutionPlan {
  executionMode: WorkflowExecutionMode.DRY_RUN;
  executed: false;
  message: string;
  requestId: string;
  correlationId: string;
  assessedAt: string;
  riskClass: 'LOW' | 'HIGH' | 'CRITICAL';
  sourceRevision: {
    type: 'saved' | 'draft';
    version: number;
  };
  workflowId: string;
  workflowVersion: number;
  workflowName: string;
  event: {
    type: string;
    entityType?: string | null;
    entityId?: string | null;
    normalizedPayload: Record<string, unknown>;
  };
  scope: WorkflowScopePlanResult;
  conditions: {
    passed: boolean;
    results: WorkflowConditionPlanResult[];
  };
  plannedActions: WorkflowPlannedAction[];
  skippedActions: WorkflowPlannedAction[];
  validationErrors: string[];
  policyBlockers: string[];
  wouldCreateApprovals: boolean;
}
