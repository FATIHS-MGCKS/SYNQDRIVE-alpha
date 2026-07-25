import { evaluateWorkflowConditionClause } from './workflow-condition-clause.evaluator';
import { migrateLegacyConditionInputs } from './workflow-condition-legacy.migrator';
import { assertTenantScopedPayload } from './workflow-condition-path-resolver';
import { validateConditionTree } from './workflow-condition-tree.validator';
import { WORKFLOW_CONDITION_ERROR_CODES } from './workflow-condition.types';
import type {
  WorkflowConditionClauseResult,
  WorkflowConditionEvaluationContext,
  WorkflowConditionEvaluationResult,
  WorkflowConditionGroupNode,
  WorkflowConditionGroupResult,
  WorkflowConditionInput,
  WorkflowConditionLogic,
  WorkflowConditionTreeEvaluationResult,
  WorkflowConditionTreeNode,
  WorkflowConditionTreeResultNode,
} from './workflow-condition.types';
import { listConditionFields } from './workflow-condition-field-registry';

function sortChildren<T extends { sortOrder?: number }>(children: T[]): T[] {
  return [...children].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function evaluateGroupLogic(
  logic: WorkflowConditionLogic,
  childResults: WorkflowConditionTreeResultNode[],
): boolean {
  switch (logic) {
    case 'ALL':
      return childResults.length === 0 || childResults.every((child) => child.passed);
    case 'ANY':
      return childResults.some((child) => child.passed);
    case 'NOT':
      return childResults.length === 1 ? !childResults[0].passed : false;
    default:
      return false;
  }
}

function countClauses(node: WorkflowConditionTreeResultNode): number {
  if (node.kind === 'clause') return 1;
  return node.children.reduce((sum, child) => sum + countClauses(child), 0);
}

export class WorkflowConditionTreeEngine {
  evaluateTree(
    root: WorkflowConditionGroupNode,
    context: WorkflowConditionEvaluationContext,
  ): WorkflowConditionTreeEvaluationResult {
    try {
      assertTenantScopedPayload(context.organizationId, context.payload);
    } catch (err) {
      const code =
        err instanceof Error && 'code' in err
          ? String((err as { code?: string }).code)
          : WORKFLOW_CONDITION_ERROR_CODES.TENANT_VIOLATION;
      const failedClause: WorkflowConditionClauseResult = {
        kind: 'clause',
        fieldPath: '*',
        operator: 'equals',
        passed: false,
        errorCode: code,
        errorMessage: 'Cross-tenant condition evaluation denied',
      };
      const failedRoot: WorkflowConditionGroupResult = {
        kind: 'group',
        logic: root.logic,
        passed: false,
        children: [failedClause],
        errorCode: code,
      };
      return {
        passed: false,
        root: failedRoot,
        clauseCount: 0,
        dryRun: context.dryRun ?? false,
      };
    }

    const validation = validateConditionTree(root);
    if (!validation.valid) {
      const firstError = validation.errors[0];
      const failedRoot: WorkflowConditionGroupResult = {
        kind: 'group',
        logic: root.logic,
        passed: false,
        children: [],
        errorCode: firstError?.code,
        errorMessage: firstError?.message,
      };
      return {
        passed: false,
        root: failedRoot,
        clauseCount: validation.clauseCount,
        dryRun: context.dryRun ?? false,
      };
    }

    const rootResult = this.evaluateGroupNode(root, context);
    const clauseCount =
      rootResult.children.reduce((sum, child) => sum + countClauses(child), 0);

    return {
      passed: rootResult.passed,
      root: rootResult,
      clauseCount,
      dryRun: context.dryRun ?? false,
    };
  }

  explainTree(
    root: WorkflowConditionGroupNode,
    context: WorkflowConditionEvaluationContext,
  ): WorkflowConditionTreeEvaluationResult {
    return this.evaluateTree(root, { ...context, dryRun: true });
  }

  /** Flat AND-list compatibility wrapper. */
  evaluate(
    conditions: WorkflowConditionInput[],
    context: WorkflowConditionEvaluationContext,
  ): WorkflowConditionEvaluationResult {
    const root = migrateLegacyConditionInputs(conditions);
    const treeResult = this.evaluateTree(root, context);
    const flatResults = flattenClauseResults(treeResult.root);

    return {
      passed: treeResult.passed,
      results: flatResults,
      dryRun: treeResult.dryRun,
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

  private evaluateGroupNode(
    node: WorkflowConditionGroupNode,
    context: WorkflowConditionEvaluationContext,
  ): WorkflowConditionGroupResult {
    if (node.children.length === 0) {
      return {
        kind: 'group',
        logic: node.logic,
        passed: node.logic === 'ALL',
        children: [],
        errorCode:
          node.logic === 'ANY' || node.logic === 'NOT'
            ? WORKFLOW_CONDITION_ERROR_CODES.GROUP_EMPTY
            : undefined,
      };
    }

    if (node.logic === 'NOT' && node.children.length !== 1) {
      return {
        kind: 'group',
        logic: 'NOT',
        passed: false,
        children: [],
        errorCode: WORKFLOW_CONDITION_ERROR_CODES.NOT_CHILD_COUNT,
        errorMessage: 'NOT group must have exactly one child',
      };
    }

    const children = sortChildren(node.children).map((child) =>
      this.evaluateNode(child, context),
    );

    return {
      kind: 'group',
      logic: node.logic,
      passed: evaluateGroupLogic(node.logic, children),
      children,
    };
  }

  private evaluateNode(
    node: WorkflowConditionTreeNode,
    context: WorkflowConditionEvaluationContext,
  ): WorkflowConditionTreeResultNode {
    if (node.kind === 'clause') {
      return evaluateWorkflowConditionClause(
        {
          fieldPath: node.fieldPath,
          legacyField: node.legacyField,
          operator: node.operator,
          value: node.value,
        },
        context,
      );
    }
    return this.evaluateGroupNode(node, context);
  }
}

function flattenClauseResults(
  root: WorkflowConditionGroupResult | null,
): WorkflowConditionClauseResult[] {
  if (!root) return [];
  const results: WorkflowConditionClauseResult[] = [];
  const walk = (node: WorkflowConditionTreeResultNode) => {
    if (node.kind === 'clause') {
      results.push(node);
      return;
    }
    for (const child of node.children) {
      walk(child);
    }
  };
  for (const child of root.children) {
    walk(child);
  }
  return results;
}

export const workflowConditionTreeEngine = new WorkflowConditionTreeEngine();

export { flattenClauseResults };
