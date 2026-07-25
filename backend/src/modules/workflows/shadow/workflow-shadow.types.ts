import type { WorkflowExecutionPlan } from '../workflow-execution-plan.types';

export interface WorkflowShadowGateResult {
  orgShadowEnabled: boolean;
  runShadow: boolean;
  runLive: boolean;
  legacyCompare: boolean;
}

export interface LegacyTaskSnapshot {
  taskId?: string;
  dedupKey: string;
  catalogKey?: string;
  ruleId?: string;
  type?: string;
  priority?: string;
  activatesAt?: string | null;
  dueDate?: string | null;
  title?: string;
  recipientSummary?: string;
}

export interface WorkflowShadowComparisonResult {
  workflowWouldTrigger: boolean;
  legacyDidExecute: boolean;
  hasDeviation: boolean;
  deviationReasons: string[];
  comparison: Record<string, { legacy?: unknown; workflow?: unknown }>;
  triggerAtDeltaMs: number | null;
  dueAtDeltaMs: number | null;
}

export interface WorkflowShadowRunSummary {
  id: string;
  workflowId: string;
  workflowVersion: number;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  status: string;
  wouldTrigger: boolean;
  wouldCreateApprovals: boolean;
  plannedActionCount: number;
  policyBlockerCount: number;
  occurredAt: string;
  createdAt: string;
  hasDeviation?: boolean;
}

export interface WorkflowShadowDeviationSummary {
  totalComparisons: number;
  deviationCount: number;
  recentDeviations: Array<{
    id: string;
    shadowRunId: string;
    catalogKey: string | null;
    dedupKey: string | null;
    deviationReasons: string[];
    createdAt: string;
  }>;
}

export type StoredWorkflowShadowPlan = WorkflowExecutionPlan;
