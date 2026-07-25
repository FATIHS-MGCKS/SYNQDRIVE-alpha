import {
  resolveConditionField,
} from './workflow-condition-field-registry';
import {
  isOperatorAllowedForType,
  normalizeConditionOperator,
} from './workflow-condition-operators';
import {
  clauseError,
  compareDecimals,
  ConditionValueError,
  isNullish,
  normalizeActualValue,
  normalizeExpectedValue,
  safeExplainValue,
} from './workflow-condition-normalizer';
import { getValueByAllowlistedPath } from './workflow-condition-path-resolver';
import {
  isWithinLocalTimeWindow,
  parseBetweenRange,
  parseDurationMs,
  parseTimeWindow,
  parseUtcMillis,
  resolveEvaluatedAtUtc,
} from './workflow-condition-temporal';
import { WORKFLOW_CONDITION_ERROR_CODES } from './workflow-condition.types';
import type {
  WorkflowConditionClauseResult,
  WorkflowConditionEvaluationContext,
  WorkflowConditionFieldDefinition,
  WorkflowConditionInput,
  WorkflowConditionOperator,
} from './workflow-condition.types';

type OrderedOperator =
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'before'
  | 'after';

export function evaluateWorkflowConditionClause(
  condition: WorkflowConditionInput,
  context: WorkflowConditionEvaluationContext,
): WorkflowConditionClauseResult {
  const registryField = resolveConditionField(
    condition.fieldPath,
    condition.legacyField,
  );

  if (!registryField) {
    return clauseError(
      condition.fieldPath || condition.legacyField || '?',
      condition.operator,
      WORKFLOW_CONDITION_ERROR_CODES.FIELD_UNSUPPORTED,
      `Field is not in condition registry: ${condition.fieldPath || condition.legacyField}`,
      `Unknown field ${condition.fieldPath || condition.legacyField}`,
    );
  }

  const operator = normalizeConditionOperator(condition.operator);
  if (!operator) {
    if (/regex|matches/i.test(condition.operator)) {
      return clauseError(
        registryField.path,
        condition.operator,
        WORKFLOW_CONDITION_ERROR_CODES.REGEX_NOT_ALLOWED,
        'Custom regex operators are not supported',
      );
    }
    return clauseError(
      registryField.path,
      condition.operator,
      WORKFLOW_CONDITION_ERROR_CODES.OPERATOR_INCOMPATIBLE,
      `Unknown operator: ${condition.operator}`,
    );
  }

  if (!isOperatorAllowedForType(registryField.dataType, operator)) {
    return clauseError(
      registryField.path,
      operator,
      WORKFLOW_CONDITION_ERROR_CODES.OPERATOR_INCOMPATIBLE,
      `Operator ${operator} is not allowed for ${registryField.dataType}`,
      `Operator/type mismatch for ${registryField.path}`,
    );
  }

  if (
    registryField.requiredPermission &&
    !(context.permissions ?? []).includes(registryField.requiredPermission)
  ) {
    return clauseError(
      registryField.path,
      operator,
      WORKFLOW_CONDITION_ERROR_CODES.SENSITIVE_FIELD_DENIED,
      `Permission ${registryField.requiredPermission} required for sensitive field`,
      `Sensitive field ${registryField.path} denied`,
    );
  }

  const rawActual = getValueByAllowlistedPath(context.payload, registryField);
  const maskedActual = safeExplainValue(registryField.dataType, rawActual);
  const expectedValue = formatExpectedForExplain(operator, registryField.dataType, condition.value);

  try {
    const passed = compareConditionValues(
      registryField,
      operator,
      rawActual,
      condition.value,
      context,
    );
    return {
      kind: 'clause',
      fieldPath: registryField.path,
      operator,
      passed,
      actualType: registryField.dataType,
      expectedType: registryField.dataType,
      maskedActual,
      expectedValue,
      explain: context.dryRun
        ? `${registryField.path} ${operator} expected=${expectedValue} actual=${maskedActual} → ${passed}`
        : undefined,
    };
  } catch (err) {
    const message = err instanceof ConditionValueError ? err.message : 'Invalid condition input';
    const code =
      err instanceof ConditionValueError
        ? err.code
        : WORKFLOW_CONDITION_ERROR_CODES.INPUT_INVALID;
    return {
      ...clauseError(registryField.path, operator, code, message),
      maskedActual,
      expectedValue,
    };
  }
}

function formatExpectedForExplain(
  operator: WorkflowConditionOperator,
  dataType: WorkflowConditionFieldDefinition['dataType'],
  value: unknown,
): string {
  if (operator === 'is_true' || operator === 'is_false') {
    return `[boolean:${operator === 'is_true'}]`;
  }
  if (operator === 'exists' || operator === 'notExists') {
    return 'n/a';
  }
  if (operator === 'withinTimeWindow' && value && typeof value === 'object') {
    return '[timeWindow]';
  }
  if (operator === 'durationExceeded' && value && typeof value === 'object') {
    return '[duration]';
  }
  if (operator === 'between' && value && typeof value === 'object') {
    return '[range]';
  }
  return safeExplainValue(dataType, value);
}

function resolvePreviousValue(
  field: WorkflowConditionFieldDefinition,
  context: WorkflowConditionEvaluationContext,
): unknown {
  if (context.previous) {
    if (field.path in context.previous) return context.previous[field.path];
    if (field.resolvePath in context.previous) return context.previous[field.resolvePath];
  }

  const workflowContext = context.payload._workflowContext;
  if (workflowContext && typeof workflowContext === 'object' && !Array.isArray(workflowContext)) {
    const previous = (workflowContext as Record<string, unknown>).previous;
    if (previous && typeof previous === 'object' && !Array.isArray(previous)) {
      return getValueByAllowlistedPath(previous as Record<string, unknown>, field);
    }
  }

  return undefined;
}

export function compareConditionValues(
  field: WorkflowConditionFieldDefinition,
  operator: WorkflowConditionOperator,
  rawActual: unknown,
  rawExpected: unknown,
  context?: WorkflowConditionEvaluationContext,
): boolean {
  const { dataType, enumValues } = field;

  if (operator === 'exists') {
    return !isNullish(rawActual);
  }
  if (operator === 'notExists') {
    return isNullish(rawActual);
  }
  if (operator === 'is_true') {
    return normalizeActualValue('boolean', rawActual, enumValues) === true;
  }
  if (operator === 'is_false') {
    return normalizeActualValue('boolean', rawActual, enumValues) === false;
  }

  if (operator === 'changedFrom' || operator === 'changedTo') {
    if (!context) {
      throw new ConditionValueError(
        'changedFrom/changedTo require evaluation context with previous values',
        WORKFLOW_CONDITION_ERROR_CODES.CHANGE_CONTEXT_MISSING,
      );
    }
    const rawPrevious = resolvePreviousValue(field, context);
    if (isNullish(rawPrevious)) {
      throw new ConditionValueError(
        'Previous value is required for changedFrom/changedTo',
        WORKFLOW_CONDITION_ERROR_CODES.CHANGE_CONTEXT_MISSING,
      );
    }
    const previous = normalizeActualValue(dataType, rawPrevious, enumValues);
    const expected = normalizeExpectedValue(dataType, rawExpected, enumValues);
    const current = isNullish(rawActual)
      ? rawActual
      : normalizeActualValue(dataType, rawActual, enumValues);

    if (operator === 'changedFrom') {
      return previous === expected && current !== expected;
    }
    return previous !== expected && current === expected;
  }

  if (operator === 'durationExceeded') {
    if (isNullish(rawActual)) {
      throw new ConditionValueError('Actual datetime is null or undefined');
    }
    const actualIso = normalizeActualValue('datetime', rawActual, enumValues) as string;
    const durationMs = parseDurationMs(rawExpected);
    const anchorIso = resolveEvaluatedAtUtc(context);
    const elapsed = parseUtcMillis(anchorIso) - parseUtcMillis(actualIso);
    return elapsed > durationMs;
  }

  if (operator === 'withinTimeWindow') {
    if (!context?.timezone) {
      throw new ConditionValueError(
        'withinTimeWindow requires context.timezone (IANA)',
        WORKFLOW_CONDITION_ERROR_CODES.TIMEZONE_REQUIRED,
      );
    }
    if (isNullish(rawActual)) {
      throw new ConditionValueError('Actual datetime is null or undefined');
    }
    const actualIso = normalizeActualValue('datetime', rawActual, enumValues) as string;
    const window = parseTimeWindow(rawExpected);
    return isWithinLocalTimeWindow(actualIso, window, context.timezone);
  }

  if (operator === 'in' || operator === 'notIn') {
    const list = normalizeExpectedValue('array', rawExpected) as unknown[];
    if (list.length === 0) {
      return operator === 'notIn';
    }
    if (isNullish(rawActual)) {
      return operator === 'notIn';
    }
    const actual = normalizeActualValue(dataType, rawActual, enumValues);
    const normalizedList = list.map((item) =>
      normalizeActualValue(dataType, item, enumValues),
    );
    const included = normalizedList.some((item) => valuesEqual(dataType, actual, item));
    return operator === 'in' ? included : !included;
  }

  if (operator === 'between') {
    if (dataType !== 'integer' && dataType !== 'decimal' && dataType !== 'datetime') {
      throw new ConditionValueError('between is not supported for this data type');
    }
    if (isNullish(rawActual)) {
      throw new ConditionValueError('Actual value is null or undefined');
    }
    const range = parseBetweenRange(rawExpected, dataType);
    const actual = normalizeActualValue(dataType, rawActual, enumValues);
    if (dataType === 'datetime') {
      const dtRange = range as { from: string; to: string };
      const actualMs = parseUtcMillis(actual as string);
      return actualMs >= parseUtcMillis(dtRange.from) && actualMs <= parseUtcMillis(dtRange.to);
    }
    const numRange = range as { from: number; to: number };
    const actualNum =
      dataType === 'decimal'
        ? Number(normalizeActualValue('decimal', actual, enumValues))
        : (actual as number);
    return actualNum >= numRange.from && actualNum <= numRange.to;
  }

  if (isNullish(rawActual)) {
    throw new ConditionValueError('Actual value is null or undefined');
  }

  const actual = normalizeActualValue(dataType, rawActual, enumValues);
  const expected = normalizeExpectedValue(dataType, rawExpected, enumValues);

  switch (operator) {
    case 'equals':
      return valuesEqual(dataType, actual, expected);
    case 'notEquals':
      return !valuesEqual(dataType, actual, expected);
    case 'contains':
      if (dataType === 'array') {
        return (actual as unknown[]).some((item) => valuesEqual('string', item, expected));
      }
      return (actual as string).includes(expected as string);
    case 'startsWith':
      return (actual as string).startsWith(expected as string);
    case 'endsWith':
      return (actual as string).endsWith(expected as string);
    case 'greaterThan':
    case 'greaterThanOrEqual':
    case 'lessThan':
    case 'lessThanOrEqual':
    case 'before':
    case 'after':
      return compareOrdered(dataType, operator, actual, expected);
    default:
      throw new ConditionValueError(`Unsupported operator ${operator}`);
  }
}

function valuesEqual(
  dataType: WorkflowConditionFieldDefinition['dataType'],
  actual: unknown,
  expected: unknown,
): boolean {
  if (dataType === 'decimal') {
    return compareDecimals(actual as string, expected as string) === 0;
  }
  return actual === expected;
}

function compareOrderedValue(
  dataType: WorkflowConditionFieldDefinition['dataType'],
  actual: unknown,
  expected: unknown,
): number {
  if (dataType === 'integer') {
    return (actual as number) - (expected as number);
  }
  if (dataType === 'decimal') {
    return compareDecimals(actual as string, expected as string);
  }
  if (dataType === 'datetime') {
    const cmp = parseUtcMillis(actual as string) - parseUtcMillis(expected as string);
    if (Number.isNaN(cmp)) {
      throw new ConditionValueError('Invalid datetime comparison');
    }
    return cmp;
  }
  throw new ConditionValueError(`Ordering not supported for ${dataType}`);
}

function compareOrdered(
  dataType: WorkflowConditionFieldDefinition['dataType'],
  operator: OrderedOperator,
  actual: unknown,
  expected: unknown,
): boolean {
  const cmp = compareOrderedValue(dataType, actual, expected);

  switch (operator) {
    case 'greaterThan':
    case 'after':
      return cmp > 0;
    case 'greaterThanOrEqual':
      return cmp >= 0;
    case 'lessThan':
    case 'before':
      return cmp < 0;
    case 'lessThanOrEqual':
      return cmp <= 0;
    default:
      return false;
  }
}
