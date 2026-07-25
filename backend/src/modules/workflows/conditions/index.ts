import type { WorkflowConditionDef } from '../workflow-definition.validator';
import { workflowConditionEngine } from './workflow-condition-engine';
import type {
  WorkflowConditionEvaluationContext,
  WorkflowConditionEvaluationResult,
  WorkflowConditionInput,
} from './workflow-condition.types';

export { workflowConditionEngine, WorkflowConditionEngine } from './workflow-condition-engine';
export { listConditionFields, WORKFLOW_CONDITION_FIELD_REGISTRY } from './workflow-condition-field-registry';
export { WORKFLOW_CONDITION_ERROR_CODES } from './workflow-condition.types';
export type {
  WorkflowConditionEvaluationContext,
  WorkflowConditionEvaluationResult,
  WorkflowConditionInput,
} from './workflow-condition.types';

function toEngineInput(condition: WorkflowConditionDef): WorkflowConditionInput {
  return {
    fieldPath: condition.path?.trim() || condition.field?.trim() || '',
    legacyField: condition.field?.trim(),
    operator: condition.operator,
    value: condition.value,
  };
}

/** @deprecated Use workflowConditionEngine.evaluate directly. */
export function evaluateWorkflowConditions(
  conditions: WorkflowConditionDef[],
  payload: Record<string, unknown>,
  context?: Partial<WorkflowConditionEvaluationContext>,
): {
  passed: boolean;
  results: Array<{ path: string; operator: string; passed: boolean }>;
} {
  const evalResult = workflowConditionEngine.evaluate(
    conditions.map(toEngineInput),
    {
      organizationId: context?.organizationId ?? (payload.organizationId as string) ?? 'unknown',
      payload,
      permissions: context?.permissions,
      dryRun: context?.dryRun,
      eventType: context?.eventType,
    },
  );
  return adaptLegacyResult(evalResult);
}

export function explainWorkflowConditions(
  conditions: WorkflowConditionDef[],
  context: WorkflowConditionEvaluationContext,
): WorkflowConditionEvaluationResult {
  return workflowConditionEngine.explain(
    conditions.map(toEngineInput),
    context,
  );
}

function adaptLegacyResult(result: WorkflowConditionEvaluationResult) {
  return {
    passed: result.passed,
    results: result.results.map((r) => ({
      path: r.fieldPath,
      operator: r.operator,
      passed: r.passed,
    })),
  };
}
