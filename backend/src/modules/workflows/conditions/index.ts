import type { WorkflowConditionDef } from '../workflow-definition.validator';
import { workflowConditionEngine } from './workflow-condition-engine';
import { workflowConditionTreeEngine } from './workflow-condition-tree.engine';
import { migrateLegacyConditionList } from './workflow-condition-legacy.migrator';
import {
  buildConditionTreeFromPrismaGroups,
  nestPrismaConditionGroups,
  type PrismaWorkflowConditionGroupRow,
} from './workflow-condition-prisma.mapper';
import { validateConditionTree } from './workflow-condition-tree.validator';
import type {
  WorkflowConditionEvaluationContext,
  WorkflowConditionEvaluationResult,
  WorkflowConditionGroupNode,
  WorkflowConditionInput,
  WorkflowConditionTreeEvaluationResult,
} from './workflow-condition.types';

export { workflowConditionEngine, WorkflowConditionEngine } from './workflow-condition-engine';
export {
  workflowConditionTreeEngine,
  WorkflowConditionTreeEngine,
  flattenClauseResults,
} from './workflow-condition-tree.engine';
export { listConditionFields, WORKFLOW_CONDITION_FIELD_REGISTRY } from './workflow-condition-field-registry';
export { WORKFLOW_CONDITION_ERROR_CODES } from './workflow-condition.types';
export { WORKFLOW_CONDITION_LIMITS } from './workflow-condition.config';
export {
  migrateLegacyConditionList,
  migrateLegacyConditionInputs,
  wrapTopLevelGroups,
} from './workflow-condition-legacy.migrator';
export {
  buildConditionTreeFromPrismaGroups,
  nestPrismaConditionGroups,
} from './workflow-condition-prisma.mapper';
export {
  WORKFLOW_CONDITION_OPERATOR_MATRIX,
  WORKFLOW_CONDITION_UNSUPPORTED_OPERATORS,
  getOperatorDefinition,
} from './workflow-condition-operators';
export { validateConditionTree, mapPrismaLogicOperator } from './workflow-condition-tree.validator';
export type {
  WorkflowConditionEvaluationContext,
  WorkflowConditionEvaluationResult,
  WorkflowConditionInput,
  WorkflowConditionLogic,
  WorkflowConditionClauseNode,
  WorkflowConditionGroupNode,
  WorkflowConditionTreeNode,
  WorkflowConditionTreeEvaluationResult,
  WorkflowConditionTreeResultNode,
  WorkflowConditionClauseResult,
  WorkflowConditionGroupResult,
  WorkflowConditionTreeValidationResult,
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

export function evaluateWorkflowConditionTree(
  root: WorkflowConditionGroupNode,
  context: WorkflowConditionEvaluationContext,
): WorkflowConditionTreeEvaluationResult {
  return workflowConditionTreeEngine.evaluateTree(root, context);
}

export function explainWorkflowConditionTree(
  root: WorkflowConditionGroupNode,
  context: WorkflowConditionEvaluationContext,
): WorkflowConditionTreeEvaluationResult {
  return workflowConditionTreeEngine.explainTree(root, context);
}

export function evaluatePrismaConditionGroups(
  groups: PrismaWorkflowConditionGroupRow[],
  context: WorkflowConditionEvaluationContext,
): WorkflowConditionTreeEvaluationResult {
  const nested = nestPrismaConditionGroups(groups);
  const tree = buildConditionTreeFromPrismaGroups(nested);
  return workflowConditionTreeEngine.evaluateTree(tree, context);
}

export function migrateAndValidateLegacyConditions(
  conditions: WorkflowConditionDef[],
): { tree: WorkflowConditionGroupNode; validation: ReturnType<typeof validateConditionTree> } {
  const tree = migrateLegacyConditionList(conditions);
  const validation = validateConditionTree(tree);
  return { tree, validation };
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
