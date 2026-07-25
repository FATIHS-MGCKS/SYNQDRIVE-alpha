import {
  resolveConditionField,
  listConditionFields,
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
import { assertTenantScopedPayload, getValueByAllowlistedPath } from './workflow-condition-path-resolver';
import { WORKFLOW_CONDITION_ERROR_CODES } from './workflow-condition.types';
import type {
  WorkflowConditionClauseResult,
  WorkflowConditionEvaluationContext,
  WorkflowConditionEvaluationResult,
  WorkflowConditionFieldDefinition,
  WorkflowConditionInput,
  WorkflowConditionOperator,
} from './workflow-condition.types';

export class WorkflowConditionEngine {
  evaluate(
    conditions: WorkflowConditionInput[],
    context: WorkflowConditionEvaluationContext,
  ): WorkflowConditionEvaluationResult {
    try {
      assertTenantScopedPayload(context.organizationId, context.payload);
    } catch (err) {
      const code =
        err instanceof Error && 'code' in err
          ? String((err as { code?: string }).code)
          : WORKFLOW_CONDITION_ERROR_CODES.TENANT_VIOLATION;
      return {
        passed: false,
        dryRun: context.dryRun ?? false,
        results: [
          clauseError('*', 'equals', code, 'Cross-tenant condition evaluation denied'),
        ],
      };
    }

    if (!conditions.length) {
      return { passed: true, results: [], dryRun: context.dryRun ?? false };
    }

    const results: WorkflowConditionClauseResult[] = [];
    for (const condition of conditions) {
      const clause = this.evaluateClause(condition, context);
      results.push(clause);
      if (!clause.passed && !context.dryRun) {
        return { passed: false, results, dryRun: false };
      }
    }

    return {
      passed: results.every((r) => r.passed),
      results,
      dryRun: context.dryRun ?? false,
    };
  }

  explain(
    conditions: WorkflowConditionInput[],
    context: WorkflowConditionEvaluationContext,
  ): WorkflowConditionEvaluationResult {
    return this.evaluate(conditions, { ...context, dryRun: true });
  }

  listFields() {
    return listConditionFields();
  }

  private evaluateClause(
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

    try {
      const passed = this.compare(
        registryField,
        operator,
        rawActual,
        condition.value,
      );
      return {
        fieldPath: registryField.path,
        operator,
        passed,
        actualType: registryField.dataType,
        expectedType: registryField.dataType,
        explain: context.dryRun
          ? `${registryField.path} ${operator} expected=${safeExplainValue(registryField.dataType, condition.value)} actual=${safeExplainValue(registryField.dataType, rawActual)} → ${passed}`
          : undefined,
      };
    } catch (err) {
      const message = err instanceof ConditionValueError ? err.message : 'Invalid condition input';
      const code =
        err instanceof ConditionValueError
          ? err.code
          : WORKFLOW_CONDITION_ERROR_CODES.INPUT_INVALID;
      return clauseError(registryField.path, operator, code, message);
    }
  }

  private compare(
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
      case 'in':
      case 'notIn': {
        const list = normalizeExpectedValue('array', rawExpected) as unknown[];
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
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
        return this.compareOrdered(dataType, operator, actual, expected);
      default:
        throw new ConditionValueError(`Unsupported operator ${operator}`);
    }
  }

  private compareOrdered(
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
}

export const workflowConditionEngine = new WorkflowConditionEngine();
