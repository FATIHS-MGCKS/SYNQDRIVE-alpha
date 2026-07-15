import type { UpsertTaskAutomationRuleOverrideInput } from './task-automation-rule-override.service';
import {
  buildPlatformDefaults,
  buildResolvedTaskAutomationRule,
  getOrgOverridableFieldKeys,
} from './task-automation-effective-rule.util';
import { requireAutomationRuleById } from './task-automation-rule.util';
import type {
  ResolvedTaskAutomationRule,
  TaskAutomationOrgOverrideSnapshot,
  TaskAutomationPlatformDefaults,
} from './task-automation-rule.types';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Merges unsaved proposed overrides onto the current effective configuration (read-only). */
export function buildProposedResolvedRule(
  current: ResolvedTaskAutomationRule,
  proposed?: Partial<UpsertTaskAutomationRuleOverrideInput> | null,
): ResolvedTaskAutomationRule {
  if (!proposed || Object.keys(proposed).length === 0) {
    return current;
  }

  const rule = requireAutomationRuleById(current.ruleId);
  const allowed = getOrgOverridableFieldKeys(rule);
  const baseOverride = current.override;

  const mergedOverride: TaskAutomationOrgOverrideSnapshot = {
    id: baseOverride?.id ?? 'proposed',
    organizationId: baseOverride?.organizationId ?? 'proposed',
    ruleId: current.ruleId,
    enabled: pickProposed('enabled', proposed.enabled, baseOverride?.enabled ?? null, allowed),
    activationOffsetMinutes: pickProposed(
      'activationOffsetMinutes',
      proposed.activationOffsetMinutes,
      baseOverride?.activationOffsetMinutes ?? null,
      allowed,
    ),
    dueOffsetMinutes: pickProposed(
      'dueOffsetMinutes',
      proposed.dueOffsetMinutes,
      baseOverride?.dueOffsetMinutes ?? null,
      allowed,
    ),
    priority: pickProposed('priority', proposed.priority, baseOverride?.priority ?? null, allowed),
    assignmentStrategy: pickProposed(
      'assignmentStrategy',
      proposed.assignmentStrategy,
      baseOverride?.assignmentStrategy ?? null,
      allowed,
    ),
    assignedUserId: pickProposed(
      'assignedUserId',
      proposed.assignedUserId,
      baseOverride?.assignedUserId ?? null,
      allowed,
    ),
    assignedRoleKey: pickProposed(
      'assignedRoleKey',
      proposed.assignedRoleKey,
      baseOverride?.assignedRoleKey ?? null,
      allowed,
    ),
    stationScope: pickProposed(
      'stationScope',
      proposed.stationScope,
      baseOverride?.stationScope ?? null,
      allowed,
    ),
    escalationConfig: pickProposedRecord(
      'escalationConfig',
      proposed.escalationConfig,
      baseOverride?.escalationConfig ?? null,
      allowed,
    ),
    notificationConfig: pickProposedRecord(
      'notificationConfig',
      proposed.notificationConfig,
      baseOverride?.notificationConfig ?? null,
      allowed,
    ),
    checklistOverrides: pickProposedRecord(
      'checklistOverrides',
      proposed.checklistOverrides,
      baseOverride?.checklistOverrides ?? null,
      allowed,
    ),
    version: baseOverride?.version ?? 0,
    createdAt: baseOverride?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const hasOverrideValues = Object.entries(mergedOverride).some(([key, value]) => {
    if (['id', 'organizationId', 'ruleId', 'version', 'createdAt', 'updatedAt'].includes(key)) {
      return false;
    }
    return value !== null && value !== undefined;
  });

  return buildResolvedTaskAutomationRule({
    rule,
    override: hasOverrideValues ? mergedOverride : null,
    allowedOverrideFields: allowed,
  });
}

function pickProposed<T>(
  field: string,
  proposed: T | null | undefined,
  persisted: T | null,
  allowed: Set<string>,
): T | null {
  if (!allowed.has(field)) return persisted;
  if (proposed === undefined) return persisted;
  return proposed;
}

function pickProposedRecord(
  field: string,
  proposed: Record<string, unknown> | null | undefined,
  persisted: Record<string, unknown> | null,
  allowed: Set<string>,
): Record<string, unknown> | null {
  if (!allowed.has(field)) return persisted;
  if (proposed === undefined) return persisted;
  return asRecord(proposed);
}

export function cloneEffectiveDefaults(
  effective: TaskAutomationPlatformDefaults,
): TaskAutomationPlatformDefaults {
  return {
    ...effective,
    escalationConfig: effective.escalationConfig ? { ...effective.escalationConfig } : null,
    notificationConfig: effective.notificationConfig ? { ...effective.notificationConfig } : null,
    checklistOverrides: effective.checklistOverrides ? { ...effective.checklistOverrides } : null,
    ruleConfig: { ...effective.ruleConfig },
  };
}
