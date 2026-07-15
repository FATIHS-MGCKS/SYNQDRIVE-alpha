import type { ApiTaskPriority } from '../../../lib/api';

export type TaskAutomationConfigSource = 'PLATFORM_DEFAULT' | 'ORG_OVERRIDE';

export interface TaskAutomationFieldProvenance<T = unknown> {
  value: T;
  source: TaskAutomationConfigSource;
}

export interface TaskAutomationPlatformDefaults {
  enabled: boolean;
  activationOffsetMinutes: number;
  dueOffsetMinutes: number;
  priority: ApiTaskPriority;
  assignmentStrategy: string;
  assignedUserId: string | null;
  assignedRoleKey: string | null;
  stationScope: string | null;
  escalationConfig: Record<string, unknown> | null;
  notificationConfig: Record<string, unknown> | null;
  checklistOverrides: Record<string, unknown> | null;
  ruleConfig: Record<string, string | number | boolean | null>;
}

export interface TaskAutomationConfigurableField {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  defaultValue: string | number | boolean | null;
  descriptionDe?: string;
  orgOverridable?: boolean;
}

export interface TaskAutomationChecklistItemView {
  title: string;
  description?: string;
  sortOrder: number;
  isRequired: boolean;
  source: TaskAutomationConfigSource;
  hidden?: boolean;
}

export interface TaskAutomationRuleDto {
  ruleId: string;
  catalogKey: string;
  nameDe: string;
  descriptionDe: string;
  categoryDe: string;
  isCritical: boolean;
  triggerLabelDe: string;
  activationLabelDe: string;
  dueLabelDe: string;
  autoResolveLabelDe: string;
  escalationLabelDe: string;
  assignmentLabelDe: string;
  priorityLabelDe: string;
  checklistTemplateLabelDe: string;
  effectivelyEnabled: boolean;
  hasOrgOverride: boolean;
  configurableFields: TaskAutomationConfigurableField[];
  allowedOverrideFields: string[];
  default: TaskAutomationPlatformDefaults;
  effective: TaskAutomationPlatformDefaults;
  fieldProvenance: Record<string, TaskAutomationFieldProvenance>;
  checklist: {
    platformItems: TaskAutomationChecklistItemView[];
    effectiveItems: TaskAutomationChecklistItemView[];
    allowsOverride: boolean;
    hasOverride: boolean;
    usesSynqDriveStandard: boolean;
  };
  audit: {
    version: number | null;
    updatedAt: string | null;
    updatedByUserId: string | null;
    updatedByName: string | null;
  };
}

export interface TaskAutomationRulesOverviewDto {
  rules: TaskAutomationRuleDto[];
  summary: {
    total: number;
    active: number;
    customized: number;
    disabled: number;
  };
}

export interface TaskAutomationChecklistOverrideForm {
  hiddenOptionalTitles: string[];
  additionalItems: Array<{
    title: string;
    description?: string;
    isRequired?: boolean;
  }>;
}

export interface TaskAutomationOverrideFormState {
  enabled: boolean;
  activationOffsetMinutes: number | null;
  dueOffsetMinutes: number | null;
  priority: ApiTaskPriority | null;
  assignmentStrategy: string | null;
  assignedUserId: string | null;
  assignedRoleKey: string | null;
  stationScope: string | null;
  checklistOverrides: TaskAutomationChecklistOverrideForm | null;
}

export type TaskAutomationOverridePayload = Partial<{
  enabled: boolean | null;
  activationOffsetMinutes: number | null;
  dueOffsetMinutes: number | null;
  priority: ApiTaskPriority | null;
  assignmentStrategy: string | null;
  assignedUserId: string | null;
  assignedRoleKey: string | null;
  stationScope: string | null;
  checklistOverrides: TaskAutomationChecklistOverrideForm | null;
  expectedVersion: number;
  reason?: string | null;
}>;

export interface TaskAutomationSimulationExample {
  labelDe: string;
  contextDe?: string;
  outcomeDe: 'created' | 'deduplicated' | 'active' | 'auto_resolved' | 'skipped' | 'trigger_only';
}

export interface TaskAutomationSimulationResult {
  ruleId: string;
  catalogKey: string;
  nameDe: string;
  disclaimerDe: string;
  period: { from: string; to: string; days: number };
  proposedEffectivelyEnabled: boolean;
  dataQuality: {
    complete: boolean;
    warningsDe: string[];
    entitiesScanned: number;
    entitiesTruncated: boolean;
  };
  estimates: {
    triggerEvents: number;
    tasksWouldBeCreated: number;
    deduplicatedMerges: number;
    currentlyActive: number;
    autoResolved: number;
  };
  summaryDe: string;
  examples: TaskAutomationSimulationExample[];
};
