import { mapPrismaLogicOperator } from './workflow-condition-tree.validator';
import { sortTreeNodes } from './workflow-condition-legacy.migrator';
import type {
  WorkflowConditionClauseNode,
  WorkflowConditionGroupNode,
  WorkflowConditionLogic,
} from './workflow-condition.types';

export interface PrismaWorkflowConditionRow {
  fieldPath: string;
  operator: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueJson: unknown;
  sortOrder: number;
}

export interface PrismaWorkflowConditionGroupRow {
  id: string;
  parentGroupId: string | null;
  logicOperator: string;
  sortOrder: number;
  conditions: PrismaWorkflowConditionRow[];
  childGroups?: PrismaWorkflowConditionGroupRow[];
}

function resolveConditionValue(row: PrismaWorkflowConditionRow): unknown {
  if (row.valueJson !== null && row.valueJson !== undefined) return row.valueJson;
  if (row.valueText !== null) return row.valueText;
  if (row.valueNumber !== null) return row.valueNumber;
  if (row.valueBoolean !== null) return row.valueBoolean;
  return undefined;
}

function mapClause(row: PrismaWorkflowConditionRow): WorkflowConditionClauseNode {
  return {
    kind: 'clause',
    fieldPath: row.fieldPath,
    operator: row.operator,
    value: resolveConditionValue(row),
    sortOrder: row.sortOrder,
  };
}

function mapGroupRow(row: PrismaWorkflowConditionGroupRow): WorkflowConditionGroupNode {
  const logic = mapPrismaLogicOperator(row.logicOperator) ?? ('ALL' as WorkflowConditionLogic);
  const clauseChildren = sortTreeNodes(row.conditions).map(mapClause);
  const groupChildren = sortTreeNodes(row.childGroups ?? []).map(mapGroupRow);
  const children = sortTreeNodes([...clauseChildren, ...groupChildren]);

  return {
    kind: 'group',
    logic,
    children,
    sortOrder: row.sortOrder,
  };
}

export function buildConditionTreeFromPrismaGroups(
  groups: PrismaWorkflowConditionGroupRow[],
): WorkflowConditionGroupNode {
  const roots = sortTreeNodes(groups.filter((group) => group.parentGroupId === null));
  const mappedRoots = roots.map(mapGroupRow);

  if (mappedRoots.length === 0) {
    return { kind: 'group', logic: 'ALL', children: [], sortOrder: 0 };
  }
  if (mappedRoots.length === 1) {
    return mappedRoots[0];
  }

  return {
    kind: 'group',
    logic: 'ALL',
    children: mappedRoots.map((group, index) => ({ ...group, sortOrder: index })),
    sortOrder: 0,
  };
}

export function nestPrismaConditionGroups(
  flatGroups: PrismaWorkflowConditionGroupRow[],
): PrismaWorkflowConditionGroupRow[] {
  const byId = new Map(flatGroups.map((group) => [group.id, { ...group, childGroups: [] as PrismaWorkflowConditionGroupRow[] }]));
  const roots: PrismaWorkflowConditionGroupRow[] = [];

  for (const group of byId.values()) {
    if (group.parentGroupId && byId.has(group.parentGroupId)) {
      byId.get(group.parentGroupId)!.childGroups!.push(group);
    } else {
      roots.push(group);
    }
  }

  return roots;
}
