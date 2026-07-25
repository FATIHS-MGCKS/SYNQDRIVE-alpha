import { createHash, randomUUID } from 'crypto';
import {
  WorkflowConditionLogicOperator,
  WorkflowConditionOperator,
  WorkflowScopeBindingType,
  WorkflowScopeType,
} from '@prisma/client';
import type {
  WorkflowActionDef,
  WorkflowConditionDef,
  WorkflowScopeDef,
  WorkflowTriggerDef,
} from './workflow-definition.validator';

export interface WorkflowGraphSnapshot {
  trigger: WorkflowTriggerDef;
  scope: WorkflowScopeDef;
  conditions: WorkflowConditionDef[];
  actions: WorkflowActionDef[];
}

export function computeWorkflowContentHash(snapshot: WorkflowGraphSnapshot): string {
  const normalized = JSON.stringify(snapshot, Object.keys(snapshot).sort());
  return createHash('sha256').update(normalized).digest('hex');
}

export function mapScopeType(raw: string): WorkflowScopeType {
  switch (raw.toLowerCase()) {
    case 'station':
      return WorkflowScopeType.STATION;
    case 'vehicle':
      return WorkflowScopeType.VEHICLE;
    default:
      return WorkflowScopeType.ORGANIZATION;
  }
}

export function mapConditionOperator(raw: string): WorkflowConditionOperator {
  const map: Record<string, WorkflowConditionOperator> = {
    equals: WorkflowConditionOperator.EQUALS,
    not_equals: WorkflowConditionOperator.NOT_EQUALS,
    notEquals: WorkflowConditionOperator.NOT_EQUALS,
    in: WorkflowConditionOperator.IN,
    not_in: WorkflowConditionOperator.NOT_IN,
    notIn: WorkflowConditionOperator.NOT_IN,
    gt: WorkflowConditionOperator.GT,
    greater_than: WorkflowConditionOperator.GT,
    gte: WorkflowConditionOperator.GTE,
    lt: WorkflowConditionOperator.LT,
    less_than: WorkflowConditionOperator.LT,
    lte: WorkflowConditionOperator.LTE,
    is_true: WorkflowConditionOperator.IS_TRUE,
    isTrue: WorkflowConditionOperator.IS_TRUE,
    is_false: WorkflowConditionOperator.IS_FALSE,
    isFalse: WorkflowConditionOperator.IS_FALSE,
    contains: WorkflowConditionOperator.CONTAINS,
    starts_with: WorkflowConditionOperator.STARTS_WITH,
    startsWith: WorkflowConditionOperator.STARTS_WITH,
  };
  return map[raw] ?? WorkflowConditionOperator.EQUALS;
}

export function serializeConditionValue(operator: WorkflowConditionOperator, value: unknown) {
  if (operator === WorkflowConditionOperator.IS_TRUE) {
    return { valueBoolean: true, valueText: null, valueNumber: null, valueJson: null };
  }
  if (operator === WorkflowConditionOperator.IS_FALSE) {
    return { valueBoolean: false, valueText: null, valueNumber: null, valueJson: null };
  }
  if (typeof value === 'number') {
    return { valueNumber: value, valueText: null, valueBoolean: null, valueJson: null };
  }
  if (typeof value === 'boolean') {
    return { valueBoolean: value, valueText: null, valueNumber: null, valueJson: null };
  }
  if (Array.isArray(value) || (value !== null && typeof value === 'object')) {
    return { valueJson: value as object, valueText: null, valueNumber: null, valueBoolean: null };
  }
  return {
    valueText: value == null ? null : String(value),
    valueNumber: null,
    valueBoolean: null,
    valueJson: null,
  };
}

export function newActionKey(): string {
  return randomUUID();
}

export function isImmutableVersionStatus(status: string): boolean {
  return status !== 'DRAFT';
}
