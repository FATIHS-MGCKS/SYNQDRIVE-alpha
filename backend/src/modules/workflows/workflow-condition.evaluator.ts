import type { WorkflowConditionDef } from './workflow-definition.validator';
import {
  evaluateWorkflowConditions as evaluateTypedWorkflowConditions,
  explainWorkflowConditions,
  workflowConditionEngine,
} from './conditions';

export { explainWorkflowConditions, workflowConditionEngine };
export type { WorkflowConditionEvaluationResult } from './conditions/workflow-condition.types';

export function evaluateWorkflowConditions(
  conditions: WorkflowConditionDef[],
  payload: Record<string, unknown>,
  context?: { organizationId?: string; permissions?: string[]; dryRun?: boolean },
) {
  return evaluateTypedWorkflowConditions(conditions, payload, context);
}
