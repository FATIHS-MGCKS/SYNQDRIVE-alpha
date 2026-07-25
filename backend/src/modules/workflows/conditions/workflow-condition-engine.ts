import { evaluateWorkflowConditionClause } from './workflow-condition-clause.evaluator';
import { assertTenantScopedPayload } from './workflow-condition-path-resolver';
import { listConditionFields } from './workflow-condition-field-registry';
import { workflowConditionTreeEngine } from './workflow-condition-tree.engine';
import { WORKFLOW_CONDITION_ERROR_CODES } from './workflow-condition.types';
import type {
  WorkflowConditionClauseResult,
  WorkflowConditionEvaluationContext,
  WorkflowConditionEvaluationResult,
  WorkflowConditionInput,
} from './workflow-condition.types';
import { clauseError } from './workflow-condition-normalizer';

export class WorkflowConditionEngine {
  evaluate(
    conditions: WorkflowConditionInput[],
    context: WorkflowConditionEvaluationContext,
  ): WorkflowConditionEvaluationResult {
    return workflowConditionTreeEngine.evaluate(conditions, context);
  }

  explain(
    conditions: WorkflowConditionInput[],
    context: WorkflowConditionEvaluationContext,
  ): WorkflowConditionEvaluationResult {
    return workflowConditionTreeEngine.explain(conditions, context);
  }

  listFields() {
    return listConditionFields();
  }

  /** Direct clause evaluation for unit tests and tooling. */
  evaluateClause(
    condition: WorkflowConditionInput,
    context: WorkflowConditionEvaluationContext,
  ): WorkflowConditionClauseResult {
    try {
      assertTenantScopedPayload(context.organizationId, context.payload);
    } catch (err) {
      const code =
        err instanceof Error && 'code' in err
          ? String((err as { code?: string }).code)
          : WORKFLOW_CONDITION_ERROR_CODES.TENANT_VIOLATION;
      return clauseError('*', 'equals', code, 'Cross-tenant condition evaluation denied');
    }
    return evaluateWorkflowConditionClause(condition, context);
  }
}

export const workflowConditionEngine = new WorkflowConditionEngine();
