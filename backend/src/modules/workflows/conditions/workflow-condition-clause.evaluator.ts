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
import { WORKFLOW_CONDITION_ERROR_CODES } from './workflow-condition.types';
import type {
  WorkflowConditionClauseResult,
  WorkflowConditionEvaluationContext,
  WorkflowConditionFieldDefinition,
  WorkflowConditionInput,
  WorkflowConditionOperator,
} from './workflow-condition.types';

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
  const expectedValue =
    operator === 'is_true' || operator === 'is_false'
      ? `[boolean:${operator === 'is_true'}]`
      : safeExplainValue(registryField.dataType, condition.value);

  try {
    const passed = compareConditionValues(
      registryField,
      operator,
      rawActual,
      condition.value,
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

export function compareConditionValues(
  field: WorkflowConditionFieldDefinition,
  operator: WorkflowConditionOperator,
  rawActual: unknown,
  rawExpected: unknown,
): boolean {
  const { dataType, enumValues } = field;

  if (operator === 'exists') {
    return !isNullish(rawActual);
  }
  if (operator === 'is_true') {
    return normalizeActualValue('boolean', rawActual, enumValues) === true;
  }
  if (operator === 'is_false') {
    return normalizeActualValue('boolean', rawActual, enumValues) === false;
  }

  if (isNullish(rawActual)) {
    throw new ConditionValueError('Actual value is null or undefined');
  }

  if (operator === 'in' || operator === 'notIn') {
    const list = normalizeExpectedValue('array', rawExpected) as unknown[];
    const actual = normalizeActualValue(dataType, rawActual, enumValues);
    const normalizedList = list.map((item) =>
      normalizeActualValue(dataType, item, enumValues),
    );
    const included = normalizedList.some((item) => {
      if (dataType === 'decimal') {
        return compareDecimals(actual as string, item as string) === 0;
      }
      return item === actual;
    });
    return operator === 'in' ? included : !included;
  }

  const actual = normalizeActualValue(dataType, rawActual, enumValues);
  const expected = normalizeExpectedValue(dataType, rawExpected, enumValues);

  switch (operator) {
    case 'equals':
      if (dataType === 'decimal') {
        return compareDecimals(actual as string, expected as string) === 0;
      }
      return actual === expected;
    case 'notEquals':
      if (dataType === 'decimal') {
        return compareDecimals(actual as string, expected as string) !== 0;
      }
      return actual !== expected;
    case 'contains':
      if (dataType === 'array') {
        return (actual as unknown[]).includes(expected);
      }
      return (actual as string).includes(expected as string);
    case 'startsWith':
      return (actual as string).startsWith(expected as string);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return compareOrdered(dataType, operator, actual, expected);
    default:
      throw new ConditionValueError(`Unsupported operator ${operator}`);
  }
}

function compareOrdered(
  dataType: WorkflowConditionFieldDefinition['dataType'],
  operator: WorkflowConditionOperator,
  actual: unknown,
  expected: unknown,
): boolean {
  let cmp = 0;
  if (dataType === 'integer') {
    cmp = (actual as number) - (expected as number);
  } else if (dataType === 'decimal') {
    cmp = compareDecimals(actual as string, expected as string);
  } else if (dataType === 'datetime') {
    cmp = Date.parse(actual as string) - Date.parse(expected as string);
    if (Number.isNaN(cmp)) {
      throw new ConditionValueError('Invalid datetime comparison');
    }
  } else {
    throw new ConditionValueError(`Ordering not supported for ${dataType}`);
  }

  switch (operator) {
    case 'gt':
      return cmp > 0;
    case 'gte':
      return cmp >= 0;
    case 'lt':
      return cmp < 0;
    case 'lte':
      return cmp <= 0;
    default:
      return false;
  }
}
