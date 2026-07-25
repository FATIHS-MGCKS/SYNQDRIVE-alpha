export const WORKFLOW_CONDITION_ERROR_CODES = {
  FIELD_UNSUPPORTED: 'CONDITION_FIELD_UNSUPPORTED',
  INPUT_INVALID: 'CONDITION_INPUT_INVALID',
  OPERATOR_INCOMPATIBLE: 'CONDITION_OPERATOR_INCOMPATIBLE',
  SENSITIVE_FIELD_DENIED: 'CONDITION_SENSITIVE_FIELD_DENIED',
  TENANT_VIOLATION: 'CONDITION_TENANT_VIOLATION',
  GROUP_EMPTY: 'CONDITION_GROUP_EMPTY',
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

export interface WorkflowConditionEvaluationContext {
  organizationId: string;
  eventType?: string;
  payload: Record<string, unknown>;
  permissions?: string[];
  dryRun?: boolean;
}

export interface WorkflowConditionClauseResult {
  fieldPath: string;
  operator: WorkflowConditionOperator;
  passed: boolean;
  errorCode?: string;
  errorMessage?: string;
  actualType?: string;
  expectedType?: string;
  /** Safe summary — no raw PII values. */
  explain?: string;
}

export interface WorkflowConditionEvaluationResult {
  passed: boolean;
  results: WorkflowConditionClauseResult[];
  dryRun: boolean;
}
