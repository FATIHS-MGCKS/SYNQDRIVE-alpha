import type {
  WorkflowConditionDataType,
  WorkflowConditionOperator,
} from './workflow-condition.types';

export const OPERATORS_BY_DATA_TYPE: Record<
  WorkflowConditionDataType,
  readonly WorkflowConditionOperator[]
> = {
  boolean: ['equals', 'notEquals', 'is_true', 'is_false', 'exists'],
  integer: ['equals', 'notEquals', 'in', 'notIn', 'gt', 'gte', 'lt', 'lte', 'exists'],
  decimal: ['equals', 'notEquals', 'in', 'notIn', 'gt', 'gte', 'lt', 'lte', 'exists'],
  datetime: ['equals', 'notEquals', 'gt', 'gte', 'lt', 'lte', 'exists'],
  enum: ['equals', 'notEquals', 'in', 'notIn', 'exists'],
  string: ['equals', 'notEquals', 'contains', 'startsWith', 'in', 'notIn', 'exists'],
  array: ['contains', 'in', 'notIn', 'exists'],
};

const PRISMA_OPERATOR_MAP: Record<string, WorkflowConditionOperator> = {
  EQUALS: 'equals',
  NOT_EQUALS: 'notEquals',
  IN: 'in',
  NOT_IN: 'notIn',
  GT: 'gt',
  GTE: 'gte',
  LT: 'lt',
  LTE: 'lte',
  IS_TRUE: 'is_true',
  IS_FALSE: 'is_false',
  CONTAINS: 'contains',
  STARTS_WITH: 'startsWith',
  equals: 'equals',
  notEquals: 'notEquals',
  not_equals: 'notEquals',
  in: 'in',
  notIn: 'notIn',
  not_in: 'notIn',
  gt: 'gt',
  greater_than: 'gt',
  gte: 'gte',
  lt: 'lt',
  less_than: 'lt',
  lte: 'lte',
  exists: 'exists',
  contains: 'contains',
  startsWith: 'startsWith',
  starts_with: 'startsWith',
  is_true: 'is_true',
  is_false: 'is_false',
};

export function normalizeConditionOperator(raw: string): WorkflowConditionOperator | null {
  return PRISMA_OPERATOR_MAP[raw] ?? PRISMA_OPERATOR_MAP[raw.toUpperCase()] ?? null;
}

export function isOperatorAllowedForType(
  dataType: WorkflowConditionDataType,
  operator: WorkflowConditionOperator,
): boolean {
  return OPERATORS_BY_DATA_TYPE[dataType].includes(operator);
}
