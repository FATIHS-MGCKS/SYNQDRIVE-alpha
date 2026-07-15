import type { TaskPriority } from '@prisma/client';
import type { OrgTaskAutomationRuleOverride } from '@prisma/client';
import { CATALOG_ORG_OVERRIDE_FIELDS } from './task-automation-rule.catalog';
import type {
  EffectiveTaskAutomationField,
  TaskAutomationAssignmentStrategy,
  TaskAutomationConfigSource,
  TaskAutomationOrgOverrideFieldKey,
  TaskAutomationOrgOverrideSnapshot,
  TaskAutomationPlatformDefaults,
  TaskAutomationRuleDefinition,
  ResolvedTaskAutomationRule,
} from './task-automation-rule.types';

function isSet<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function getOrgOverridableFieldKeys(
  rule: TaskAutomationRuleDefinition,
): Set<string> {
  const keys = new Set<string>();
  if (rule.catalogKey) {
    for (const key of CATALOG_ORG_OVERRIDE_FIELDS[rule.catalogKey] ?? []) {
      keys.add(key);
    }
  }
  for (const field of rule.configurableFields) {
    if (field.orgOverridable) {
      keys.add(field.field);
    }
  }
  return keys;
}

export function buildPlatformDefaults(
  rule: TaskAutomationRuleDefinition,
): TaskAutomationPlatformDefaults {
  const ruleConfig: Record<string, string | number | boolean | null> = {};
  for (const field of rule.configurableFields) {
    ruleConfig[field.field] = field.defaultValue ?? null;
  }

  return {
    enabled: rule.defaultEnabled,
    activationOffsetMinutes: 0,
    dueOffsetMinutes: 0,
    priority: rule.defaultPriority,
    assignmentStrategy: rule.assignmentStrategy,
    assignedUserId: null,
    assignedRoleKey: null,
    stationScope: null,
    escalationConfig: null,
    notificationConfig: null,
    checklistOverrides: null,
    ruleConfig,
  };
}

export function mapOverrideRow(
  row: OrgTaskAutomationRuleOverride,
): TaskAutomationOrgOverrideSnapshot {
  return {
    id: row.id,
    organizationId: row.organizationId,
    ruleId: row.ruleId,
    enabled: row.enabled,
    activationOffsetMinutes: row.activationOffsetMinutes,
    dueOffsetMinutes: row.dueOffsetMinutes,
    priority: row.priority,
    assignmentStrategy: row.assignmentStrategy,
    assignedUserId: row.assignedUserId,
    assignedRoleKey: row.assignedRoleKey,
    stationScope: row.stationScope,
    escalationConfig: asRecord(row.escalationConfig),
    notificationConfig: asRecord(row.notificationConfig),
    checklistOverrides: asRecord(row.checklistOverrides),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function resolveField<T>(
  fieldKey: string,
  layers: Array<{ source: TaskAutomationConfigSource; value: T | null | undefined }>,
  fallback: T,
): { value: T; provenance: EffectiveTaskAutomationField<T> } {
  for (const layer of layers) {
    if (isSet(layer.value)) {
      return {
        value: layer.value,
        provenance: { value: layer.value, source: layer.source },
      };
    }
  }
  return {
    value: fallback,
    provenance: { value: fallback, source: 'PLATFORM_DEFAULT' },
  };
}

export function buildResolvedTaskAutomationRule(input: {
  rule: TaskAutomationRuleDefinition;
  override: TaskAutomationOrgOverrideSnapshot | null;
  allowedOverrideFields: Set<string>;
}): ResolvedTaskAutomationRule {
  const platformDefaults = buildPlatformDefaults(input.rule);
  const override = input.override;
  const allowed = input.allowedOverrideFields;

  const pickOverride = <T,>(key: TaskAutomationOrgOverrideFieldKey, value: T | null | undefined) =>
    allowed.has(key) ? value : undefined;

  const enabled = resolveField(
    'enabled',
    [
      { source: 'ORG_OVERRIDE', value: pickOverride('enabled', override?.enabled) },
      { source: 'PLATFORM_DEFAULT', value: platformDefaults.enabled },
    ],
    platformDefaults.enabled,
  );

  const activationOffsetMinutes = resolveField(
    'activationOffsetMinutes',
    [
      {
        source: 'ORG_OVERRIDE',
        value: pickOverride('activationOffsetMinutes', override?.activationOffsetMinutes),
      },
    ],
    platformDefaults.activationOffsetMinutes,
  );

  const dueOffsetMinutes = resolveField(
    'dueOffsetMinutes',
    [{ source: 'ORG_OVERRIDE', value: pickOverride('dueOffsetMinutes', override?.dueOffsetMinutes) }],
    platformDefaults.dueOffsetMinutes,
  );

  const priority = resolveField<TaskPriority>(
    'priority',
    [{ source: 'ORG_OVERRIDE', value: pickOverride('priority', override?.priority ?? undefined) }],
    platformDefaults.priority,
  );

  const assignmentStrategy = resolveField<TaskAutomationAssignmentStrategy>(
    'assignmentStrategy',
    [
      {
        source: 'ORG_OVERRIDE',
        value: pickOverride(
          'assignmentStrategy',
          (override?.assignmentStrategy as TaskAutomationAssignmentStrategy | null) ?? undefined,
        ),
      },
    ],
    platformDefaults.assignmentStrategy,
  );

  const assignedUserId = resolveField<string | null>(
    'assignedUserId',
    [{ source: 'ORG_OVERRIDE', value: pickOverride('assignedUserId', override?.assignedUserId) }],
    platformDefaults.assignedUserId,
  );

  const assignedRoleKey = resolveField<string | null>(
    'assignedRoleKey',
    [{ source: 'ORG_OVERRIDE', value: pickOverride('assignedRoleKey', override?.assignedRoleKey) }],
    platformDefaults.assignedRoleKey,
  );

  const stationScope = resolveField<string | null>(
    'stationScope',
    [{ source: 'ORG_OVERRIDE', value: pickOverride('stationScope', override?.stationScope) }],
    platformDefaults.stationScope,
  );

  const escalationConfig = resolveField<Record<string, unknown> | null>(
    'escalationConfig',
    [{ source: 'ORG_OVERRIDE', value: pickOverride('escalationConfig', override?.escalationConfig) }],
    platformDefaults.escalationConfig,
  );

  const notificationConfig = resolveField<Record<string, unknown> | null>(
    'notificationConfig',
    [{ source: 'ORG_OVERRIDE', value: pickOverride('notificationConfig', override?.notificationConfig) }],
    platformDefaults.notificationConfig,
  );

  const checklistOverrides = resolveField<Record<string, unknown> | null>(
    'checklistOverrides',
    [{ source: 'ORG_OVERRIDE', value: pickOverride('checklistOverrides', override?.checklistOverrides) }],
    platformDefaults.checklistOverrides,
  );

  const effective: TaskAutomationPlatformDefaults = {
    enabled: enabled.value,
    activationOffsetMinutes: activationOffsetMinutes.value,
    dueOffsetMinutes: dueOffsetMinutes.value,
    priority: priority.value,
    assignmentStrategy: assignmentStrategy.value,
    assignedUserId: assignedUserId.value,
    assignedRoleKey: assignedRoleKey.value,
    stationScope: stationScope.value,
    escalationConfig: escalationConfig.value,
    notificationConfig: notificationConfig.value,
    checklistOverrides: checklistOverrides.value,
    ruleConfig: { ...platformDefaults.ruleConfig },
  };

  const fieldProvenance: Record<string, EffectiveTaskAutomationField<unknown>> = {
    enabled: enabled.provenance,
    activationOffsetMinutes: activationOffsetMinutes.provenance,
    dueOffsetMinutes: dueOffsetMinutes.provenance,
    priority: priority.provenance,
    assignmentStrategy: assignmentStrategy.provenance,
    assignedUserId: assignedUserId.provenance,
    assignedRoleKey: assignedRoleKey.provenance,
    stationScope: stationScope.provenance,
    escalationConfig: escalationConfig.provenance,
    notificationConfig: notificationConfig.provenance,
    checklistOverrides: checklistOverrides.provenance,
  };

  for (const field of input.rule.configurableFields) {
    fieldProvenance[`ruleConfig.${field.field}`] = {
      value: effective.ruleConfig[field.field] ?? null,
      source: 'PLATFORM_DEFAULT',
    };
  }

  return {
    ruleId: input.rule.ruleId,
    catalogVersion: input.rule.version,
    catalogKey: input.rule.catalogKey ?? null,
    materializesTask: input.rule.materializesTask,
    default: platformDefaults,
    override,
    effective,
    fieldProvenance,
    effectivelyEnabled: effective.enabled,
  };
}

export function shouldMaterializeFromResolvedRule(resolved: ResolvedTaskAutomationRule): boolean {
  return resolved.materializesTask && resolved.effectivelyEnabled;
}

export function applyTimingOffsets(input: {
  activatesAt: Date;
  dueDate: Date;
  activationOffsetMinutes: number;
  dueOffsetMinutes: number;
}): { activatesAt: Date; dueDate: Date } {
  const activatesAt = new Date(
    input.activatesAt.getTime() + input.activationOffsetMinutes * 60_000,
  );
  const dueDate = new Date(input.dueDate.getTime() + input.dueOffsetMinutes * 60_000);
  return { activatesAt, dueDate };
}
