import type { WorkflowConditionDef } from '../workflow-definition.validator';
import type {
  WorkflowConditionClauseNode,
  WorkflowConditionGroupNode,
  WorkflowConditionInput,
  WorkflowConditionLogic,
  WorkflowConditionTreeNode,
} from './workflow-condition.types';

export function migrateLegacyConditionList(
  conditions: WorkflowConditionDef[],
): WorkflowConditionGroupNode {
  const children: WorkflowConditionClauseNode[] = conditions.map((condition, index) => ({
    kind: 'clause' as const,
    fieldPath: condition.path?.trim() || condition.field?.trim() || '',
    legacyField: condition.field?.trim(),
    operator: condition.operator,
    value: condition.value,
    sortOrder: index,
  }));

  return {
    kind: 'group',
    logic: 'ALL',
    children,
    sortOrder: 0,
  };
}

export function migrateLegacyConditionInputs(
  conditions: WorkflowConditionInput[],
): WorkflowConditionGroupNode {
  const children: WorkflowConditionClauseNode[] = conditions.map((condition, index) => ({
    kind: 'clause' as const,
    fieldPath: condition.fieldPath,
    legacyField: condition.legacyField,
    operator: condition.operator,
    value: condition.value,
    sortOrder: index,
  }));

  return {
    kind: 'group',
    logic: 'ALL',
    children,
    sortOrder: 0,
  };
}

export function wrapTopLevelGroups(
  groups: WorkflowConditionGroupNode[],
): WorkflowConditionGroupNode {
  if (groups.length === 0) {
    return { kind: 'group', logic: 'ALL', children: [], sortOrder: 0 };
  }
  if (groups.length === 1) {
    return groups[0];
  }
  return {
    kind: 'group',
    logic: 'ALL',
    children: groups.map((group, index) => ({ ...group, sortOrder: index })),
    sortOrder: 0,
  };
}

export function toClauseInput(node: WorkflowConditionClauseNode): WorkflowConditionInput {
  return {
    fieldPath: node.fieldPath,
    legacyField: node.legacyField,
    operator: node.operator,
    value: node.value,
  };
}

export function sortTreeNodes<T extends { sortOrder?: number }>(nodes: T[]): T[] {
  return [...nodes].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export function isGroupNode(node: WorkflowConditionTreeNode): node is WorkflowConditionGroupNode {
  return node.kind === 'group';
}

export function isClauseNode(node: WorkflowConditionTreeNode): node is WorkflowConditionClauseNode {
  return node.kind === 'clause';
}

export function normalizeLogicAlias(logic: string): WorkflowConditionLogic {
  const upper = logic.toUpperCase();
  if (upper === 'AND' || upper === 'ALL') return 'ALL';
  if (upper === 'OR' || upper === 'ANY') return 'ANY';
  if (upper === 'NOT') return 'NOT';
  return logic as WorkflowConditionLogic;
}
