import { WORKFLOW_CONDITION_LIMITS } from './workflow-condition.config';
import { WORKFLOW_CONDITION_ERROR_CODES } from './workflow-condition.types';
import type {
  WorkflowConditionGroupNode,
  WorkflowConditionLogic,
  WorkflowConditionTreeNode,
  WorkflowConditionTreeValidationResult,
} from './workflow-condition.types';

const VALID_LOGIC: ReadonlySet<WorkflowConditionLogic> = new Set(['ALL', 'ANY', 'NOT']);

export function mapPrismaLogicOperator(raw: string): WorkflowConditionLogic | null {
  switch (raw.toUpperCase()) {
    case 'AND':
    case 'ALL':
      return 'ALL';
    case 'OR':
    case 'ANY':
      return 'ANY';
    case 'NOT':
      return 'NOT';
    default:
      return null;
  }
}

export function validateConditionTree(
  root: WorkflowConditionTreeNode | WorkflowConditionGroupNode | null | undefined,
  options?: { payloadBytes?: number },
): WorkflowConditionTreeValidationResult {
  const errors: WorkflowConditionTreeValidationResult['errors'] = [];

  if (options?.payloadBytes !== undefined) {
    if (options.payloadBytes > WORKFLOW_CONDITION_LIMITS.maxPayloadBytes) {
      errors.push({
        code: WORKFLOW_CONDITION_ERROR_CODES.PAYLOAD_TOO_LARGE,
        message: `Condition payload exceeds ${WORKFLOW_CONDITION_LIMITS.maxPayloadBytes} bytes`,
      });
    }
  }

  if (!root) {
    return { valid: errors.length === 0, errors, clauseCount: 0, nodeCount: 0, maxDepth: 0 };
  }

  const stats = { clauseCount: 0, nodeCount: 0, maxDepth: 0 };

  const visit = (node: WorkflowConditionTreeNode, depth: number): void => {
    stats.nodeCount += 1;
    stats.maxDepth = Math.max(stats.maxDepth, depth);

    if (depth > WORKFLOW_CONDITION_LIMITS.maxTreeDepth) {
      errors.push({
        code: WORKFLOW_CONDITION_ERROR_CODES.TREE_DEPTH_EXCEEDED,
        message: `Condition tree depth ${depth} exceeds max ${WORKFLOW_CONDITION_LIMITS.maxTreeDepth}`,
      });
      return;
    }

    if (stats.nodeCount > WORKFLOW_CONDITION_LIMITS.maxNodeCount) {
      errors.push({
        code: WORKFLOW_CONDITION_ERROR_CODES.NODE_COUNT_EXCEEDED,
        message: `Condition tree node count exceeds max ${WORKFLOW_CONDITION_LIMITS.maxNodeCount}`,
      });
      return;
    }

    if (node.kind === 'clause') {
      stats.clauseCount += 1;
      if (!node.fieldPath?.trim() && !node.legacyField?.trim()) {
        errors.push({
          code: WORKFLOW_CONDITION_ERROR_CODES.STRUCTURE_INVALID,
          message: 'Clause requires fieldPath or legacyField',
        });
      }
      if (!node.operator?.trim()) {
        errors.push({
          code: WORKFLOW_CONDITION_ERROR_CODES.STRUCTURE_INVALID,
          message: 'Clause requires operator',
        });
      }
      if (stats.clauseCount > WORKFLOW_CONDITION_LIMITS.maxClauseCount) {
        errors.push({
          code: WORKFLOW_CONDITION_ERROR_CODES.CLAUSE_COUNT_EXCEEDED,
          message: `Clause count exceeds max ${WORKFLOW_CONDITION_LIMITS.maxClauseCount}`,
        });
      }
      return;
    }

    if (node.kind !== 'group') {
      errors.push({
        code: WORKFLOW_CONDITION_ERROR_CODES.STRUCTURE_INVALID,
        message: 'Node must be clause or group',
      });
      return;
    }

    if (!VALID_LOGIC.has(node.logic)) {
      errors.push({
        code: WORKFLOW_CONDITION_ERROR_CODES.STRUCTURE_INVALID,
        message: `Invalid group logic: ${String(node.logic)}`,
      });
      return;
    }

    if (!Array.isArray(node.children)) {
      errors.push({
        code: WORKFLOW_CONDITION_ERROR_CODES.STRUCTURE_INVALID,
        message: 'Group children must be an array',
      });
      return;
    }

    if (node.logic === 'NOT') {
      if (node.children.length !== 1) {
        errors.push({
          code: WORKFLOW_CONDITION_ERROR_CODES.NOT_CHILD_COUNT,
          message: 'NOT group must have exactly one child',
        });
      }
    } else if (node.logic === 'ANY' && node.children.length === 0) {
      errors.push({
        code: WORKFLOW_CONDITION_ERROR_CODES.GROUP_EMPTY,
        message: `${node.logic} group must not be empty`,
      });
    }

    const sortedChildren = [...node.children].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
    for (const child of sortedChildren) {
      if (!child || typeof child !== 'object' || !('kind' in child)) {
        errors.push({
          code: WORKFLOW_CONDITION_ERROR_CODES.STRUCTURE_INVALID,
          message: 'Invalid child node in condition tree',
        });
        continue;
      }
      visit(child as WorkflowConditionTreeNode, depth + 1);
    }
  };

  const normalized = root.kind === 'group' ? root : null;
  if (!normalized) {
    errors.push({
      code: WORKFLOW_CONDITION_ERROR_CODES.STRUCTURE_INVALID,
      message: 'Condition tree root must be a group node',
    });
    return { valid: false, errors, clauseCount: 0, nodeCount: 0, maxDepth: 0 };
  }

  visit(normalized, 1);

  return {
    valid: errors.length === 0,
    errors,
    clauseCount: stats.clauseCount,
    nodeCount: stats.nodeCount,
    maxDepth: stats.maxDepth,
  };
}

export function guardAgainstCyclicReferences(
  root: WorkflowConditionGroupNode,
  seenIds?: Set<string>,
): boolean {
  const seen = seenIds ?? new Set<string>();
  const walk = (node: WorkflowConditionTreeNode, groupId?: string): boolean => {
    if (groupId) {
      if (seen.has(groupId)) return false;
      seen.add(groupId);
    }
    if (node.kind === 'clause') return true;
    for (const child of node.children) {
      if (!walk(child)) return false;
    }
    return true;
  };
  return walk(root);
}
