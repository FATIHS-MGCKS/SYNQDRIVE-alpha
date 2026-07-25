export const WORKFLOW_CONDITION_ERROR_CODES = {
  FIELD_UNSUPPORTED: 'CONDITION_FIELD_UNSUPPORTED',
  INPUT_INVALID: 'CONDITION_INPUT_INVALID',
  OPERATOR_INCOMPATIBLE: 'CONDITION_OPERATOR_INCOMPATIBLE',
  SENSITIVE_FIELD_DENIED: 'CONDITION_SENSITIVE_FIELD_DENIED',
  TENANT_VIOLATION: 'CONDITION_TENANT_VIOLATION',
  GROUP_EMPTY: 'CONDITION_GROUP_EMPTY',
  TREE_DEPTH_EXCEEDED: 'CONDITION_TREE_DEPTH_EXCEEDED',
  CLAUSE_COUNT_EXCEEDED: 'CONDITION_CLAUSE_COUNT_EXCEEDED',
  NODE_COUNT_EXCEEDED: 'CONDITION_NODE_COUNT_EXCEEDED',
  PAYLOAD_TOO_LARGE: 'CONDITION_PAYLOAD_TOO_LARGE',
  STRUCTURE_INVALID: 'CONDITION_STRUCTURE_INVALID',
  NOT_CHILD_COUNT: 'CONDITION_NOT_CHILD_COUNT',
} as const;

export type WorkflowConditionDataType =
  | 'boolean'
  | 'integer'
  | 'decimal'
  | 'datetime'
  | 'enum'
  | 'string'
  | 'array';

export type WorkflowConditionOperator =
  | 'equals'
  | 'notEquals'
  | 'in'
  | 'notIn'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'exists'
  | 'contains'
  | 'startsWith'
  | 'is_true'
  | 'is_false';

export type WorkflowConditionPiiClass = 'none' | 'pii' | 'sensitive';

/** Logical combinator for nested condition groups. */
export type WorkflowConditionLogic = 'ALL' | 'ANY' | 'NOT';

export interface WorkflowConditionFieldDefinition {
  path: string;
  dataType: WorkflowConditionDataType;
  label: string;
  allowedOperators: readonly WorkflowConditionOperator[];
  enumValues?: readonly string[];
  piiClass: WorkflowConditionPiiClass;
  requiredPermission?: string;
  legacyFieldKeys?: readonly string[];
  /** Dot path under evaluation root (without payload. prefix). */
  resolvePath: string;
}

export interface WorkflowConditionInput {
  fieldPath: string;
  operator: string;
  value?: unknown;
  legacyField?: string;
}

export interface WorkflowConditionClauseNode {
  kind: 'clause';
  fieldPath: string;
  operator: string;
  value?: unknown;
  legacyField?: string;
  sortOrder?: number;
}

export interface WorkflowConditionGroupNode {
  kind: 'group';
  logic: WorkflowConditionLogic;
  children: WorkflowConditionTreeNode[];
  sortOrder?: number;
}

export type WorkflowConditionTreeNode = WorkflowConditionClauseNode | WorkflowConditionGroupNode;

export interface WorkflowConditionEvaluationContext {
  organizationId: string;
  eventType?: string;
  payload: Record<string, unknown>;
  permissions?: string[];
  dryRun?: boolean;
}

export interface WorkflowConditionClauseResult {
  kind: 'clause';
  fieldPath: string;
  operator: WorkflowConditionOperator;
  passed: boolean;
  errorCode?: string;
  errorMessage?: string;
  actualType?: string;
  expectedType?: string;
  /** PII-safe masked actual value for explain/dry-run. */
  maskedActual?: string;
  /** PII-safe masked expected value for explain/dry-run. */
  expectedValue?: string;
  /** Safe summary — no raw PII values. */
  explain?: string;
}

export interface WorkflowConditionGroupResult {
  kind: 'group';
  logic: WorkflowConditionLogic;
  passed: boolean;
  children: WorkflowConditionTreeResultNode[];
  errorCode?: string;
  errorMessage?: string;
}

export type WorkflowConditionTreeResultNode =
  | WorkflowConditionClauseResult
  | WorkflowConditionGroupResult;

export interface WorkflowConditionTreeEvaluationResult {
  passed: boolean;
  root: WorkflowConditionGroupResult | null;
  clauseCount: number;
  dryRun: boolean;
}

/** @deprecated Flat result — use WorkflowConditionTreeEvaluationResult. */
export interface WorkflowConditionEvaluationResult {
  passed: boolean;
  results: WorkflowConditionClauseResult[];
  dryRun: boolean;
}

export interface WorkflowConditionTreeValidationResult {
  valid: boolean;
  errors: Array<{ code: string; message: string }>;
  clauseCount: number;
  nodeCount: number;
  maxDepth: number;
}
