/** UI-facing types for workflow condition trees (Phase 6 Prompt 26). */

export type WorkflowConditionLogic = 'ALL' | 'ANY' | 'NOT';

export interface WorkflowConditionClauseUi {
  kind: 'clause';
  fieldPath: string;
  operator: string;
  value?: unknown;
  sortOrder?: number;
}

export interface WorkflowConditionGroupUi {
  kind: 'group';
  logic: WorkflowConditionLogic;
  children: WorkflowConditionTreeUiNode[];
  sortOrder?: number;
}

export type WorkflowConditionTreeUiNode = WorkflowConditionClauseUi | WorkflowConditionGroupUi;

export interface WorkflowConditionClauseResultUi {
  kind: 'clause';
  fieldPath: string;
  operator: string;
  passed: boolean;
  maskedActual?: string;
  expectedValue?: string;
  errorCode?: string;
}

export interface WorkflowConditionGroupResultUi {
  kind: 'group';
  logic: WorkflowConditionLogic;
  passed: boolean;
  children: WorkflowConditionTreeResultUiNode[];
  errorCode?: string;
}

export type WorkflowConditionTreeResultUiNode =
  | WorkflowConditionClauseResultUi
  | WorkflowConditionGroupResultUi;

export interface WorkflowConditionTreeEvaluationUi {
  passed: boolean;
  root: WorkflowConditionGroupResultUi | null;
  clauseCount: number;
  dryRun: boolean;
}

export const WORKFLOW_CONDITION_LIMITS_UI = {
  maxTreeDepth: 5,
  maxClauseCount: 50,
  maxNodeCount: 100,
} as const;
