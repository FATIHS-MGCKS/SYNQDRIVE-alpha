import type { TaskPriority } from '@prisma/client';
import type { ResolvedTaskAutomationRule } from '@modules/tasks/automation/task-automation-rule.types';
import type { TaskAutomationWorkflowSystemMetadata } from './task-automation-workflow-bridge.types';

export interface TaskAutomationWorkflowActionConfig {
  __payloadMerge: true;
  automationCatalogKey: string;
  automationRuleId: string;
  priority?: TaskPriority;
  activationOffsetMinutes?: number;
  dueOffsetMinutes?: number;
  assignmentStrategy?: string;
  assignedUserId?: string | null;
  assignedRoleKey?: string | null;
  stationScope?: string | null;
  checklistOverrides?: Record<string, unknown> | null;
}

export function buildWorkflowActionConfigFromResolvedRule(
  resolved: ResolvedTaskAutomationRule,
): TaskAutomationWorkflowActionConfig {
  const effective = resolved.effective;
  return {
    __payloadMerge: true,
    automationCatalogKey: resolved.catalogKey ?? '',
    automationRuleId: resolved.ruleId,
    priority: effective.priority,
    activationOffsetMinutes: effective.activationOffsetMinutes,
    dueOffsetMinutes: effective.dueOffsetMinutes,
    assignmentStrategy: effective.assignmentStrategy,
    assignedUserId: effective.assignedUserId,
    assignedRoleKey: effective.assignedRoleKey,
    stationScope: effective.stationScope,
    checklistOverrides: effective.checklistOverrides,
  };
}

export function buildSystemMetadataFromRule(input: {
  ruleId: string;
  catalogKey: string;
  catalogRuleVersion: number;
  orgOverrideVersion?: number | null;
  migrationRunId?: string;
}): TaskAutomationWorkflowSystemMetadata {
  return {
    systemTemplate: true,
    catalogRuleId: input.ruleId,
    catalogKey: input.catalogKey as TaskAutomationWorkflowSystemMetadata['catalogKey'],
    templateVersion: 1,
    catalogRuleVersion: input.catalogRuleVersion,
    orgOverrideVersion: input.orgOverrideVersion ?? null,
    migratedAt: new Date().toISOString(),
    migrationRunId: input.migrationRunId,
  };
}
