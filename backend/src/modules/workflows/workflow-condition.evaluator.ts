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
    case 'not_equals': return 'notEquals';
    case 'greater_than': return 'gt';
    case 'less_than': return 'lt';
    case 'is_true': return 'equals';
    case 'is_false': return 'equals';
    default: return op;
  }
}

export function evaluateWorkflowConditions(
  conditions: WorkflowConditionDef[],
  payload: Record<string, unknown>,
): { passed: boolean; results: Array<{ path: string; operator: string; passed: boolean }> } {
  if (!conditions.length) {
    return { passed: true, results: [] };
  }

  const results: Array<{ path: string; operator: string; passed: boolean }> = [];

  for (const condition of conditions) {
    const path = resolvePath(condition);
    if (!path) {
      results.push({ path: '?', operator: condition.operator, passed: false });
      continue;
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

    results.push({ path, operator, passed });
    if (!passed) {
      return { passed: false, results };
    }
  }

  return { passed: true, results };
}
