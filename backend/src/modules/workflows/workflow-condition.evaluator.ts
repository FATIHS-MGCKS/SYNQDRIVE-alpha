import type { WorkflowConditionDef } from './workflow-definition.validator';

const LEGACY_FIELD_TO_PATH: Record<string, string> = {
  vehicle_status: 'payload.vehicleStatus',
  cleaning_status: 'payload.cleaningStatus',
  health_score: 'payload.healthScore',
  mileage: 'payload.mileage',
  booking_type: 'payload.bookingType',
  vehicle_group: 'payload.vehicleGroup',
  station: 'payload.stationId',
  days_since_last_service: 'payload.daysSinceLastService',
  invoice_amount: 'payload.invoiceAmountCents',
  overdue_days: 'payload.overdueDays',
  damage_severity: 'payload.damageSeverity',
  severity: 'payload.severity',
};

export interface WorkflowConditionGroup {
  match?: 'all' | 'any';
  negate?: boolean;
  rules?: WorkflowConditionDef[];
  all?: WorkflowConditionDef[];
  any?: WorkflowConditionDef[];
}

export function resolveConditionGroup(input: unknown): {
  match: 'all' | 'any';
  negate: boolean;
  rules: WorkflowConditionDef[];
} {
  if (Array.isArray(input)) {
    return { match: 'all', negate: false, rules: input as WorkflowConditionDef[] };
  }
  if (input && typeof input === 'object') {
    const group = input as WorkflowConditionGroup;
    if (group.match === 'any' || Array.isArray(group.any)) {
      return {
        match: 'any',
        negate: Boolean(group.negate),
        rules: (group.rules ?? group.any ?? []) as WorkflowConditionDef[],
      };
    }
    return {
      match: 'all',
      negate: Boolean(group.negate),
      rules: (group.rules ?? group.all ?? []) as WorkflowConditionDef[],
    };
  }
  return { match: 'all', negate: false, rules: [] };
}

function resolvePath(condition: WorkflowConditionDef): string | null {
  if (condition.path?.trim()) return condition.path.trim();
  if (condition.field?.trim()) {
    return LEGACY_FIELD_TO_PATH[condition.field] ?? `payload.${condition.field}`;
  }
  return null;
}

function getByPath(root: Record<string, unknown>, path: string): unknown {
  const normalized = path.startsWith('payload.') ? path.slice('payload.'.length) : path;
  const parts = normalized.split('.').filter(Boolean);
  let cur: unknown = root;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function normalizeOperator(op: string): string {
  switch (op) {
    case 'not_equals':
      return 'notEquals';
    case 'greater_than':
      return 'gt';
    case 'less_than':
      return 'lt';
    case 'is_true':
      return 'equals';
    case 'is_false':
      return 'equals';
    default:
      return op;
  }
}

function evaluateSingleCondition(
  condition: WorkflowConditionDef,
  payload: Record<string, unknown>,
): { path: string; operator: string; passed: boolean } {
  const path = resolvePath(condition);
  if (!path) {
    return { path: '?', operator: condition.operator, passed: false };
  }
  const operator = normalizeOperator(condition.operator);
  const actual = getByPath(payload, path);
  let passed = false;

  if (condition.operator === 'is_true') {
    passed = actual === true;
  } else if (condition.operator === 'is_false') {
    passed = actual === false;
  } else {
    switch (operator) {
      case 'equals':
        passed = actual === condition.value;
        break;
      case 'notEquals':
        passed = actual !== condition.value;
        break;
      case 'in':
        passed = Array.isArray(condition.value) && condition.value.includes(actual);
        break;
      case 'notIn':
        passed = Array.isArray(condition.value) && !condition.value.includes(actual);
        break;
      case 'gt':
        passed = Number(actual) > Number(condition.value);
        break;
      case 'gte':
        passed = Number(actual) >= Number(condition.value);
        break;
      case 'lt':
        passed = Number(actual) < Number(condition.value);
        break;
      case 'lte':
        passed = Number(actual) <= Number(condition.value);
        break;
      case 'exists':
        passed = actual !== undefined && actual !== null;
        break;
      case 'contains':
        passed =
          typeof actual === 'string' &&
          typeof condition.value === 'string' &&
          actual.includes(condition.value);
        break;
      default:
        passed = false;
    }
  }

  return { path, operator, passed };
}

export function evaluateWorkflowConditions(
  conditionsInput: unknown,
  payload: Record<string, unknown>,
): { passed: boolean; results: Array<{ path: string; operator: string; passed: boolean }> } {
  const { match, negate, rules } = resolveConditionGroup(conditionsInput);
  if (!rules.length) {
    return { passed: true, results: [] };
  }

  const results = rules.map((condition) => evaluateSingleCondition(condition, payload));
  const combined =
    match === 'any'
      ? results.some((result) => result.passed)
      : results.every((result) => result.passed);
  const passed = negate ? !combined : combined;

  return { passed, results };
}
