import type {
  TaskAutomationChecklistOverrideForm,
  TaskAutomationFieldProvenance,
  TaskAutomationOverrideFormState,
  TaskAutomationOverridePayload,
  TaskAutomationPlatformDefaults,
  TaskAutomationRuleDto,
} from './task-automation.types';
import {
  at,
  formatTaskAutomationAuditTimestamp,
  formatTaskAutomationOffsetMinutes,
  labelTaskAutomationAssignment,
  labelTaskAutomationPriority,
  labelTaskAutomationSource,
  parseTaskAutomationApiError,
  summarizeTaskAutomationChecklistState,
} from './automation-i18n';

export function labelTaskAutomationSourceForLocale(
  locale: string,
  source: import('./task-automation.types').TaskAutomationConfigSource | null | undefined,
): string {
  return labelTaskAutomationSource(locale, source);
}

export function labelPriorityForLocale(locale: string, priority: string | null | undefined): string {
  return labelTaskAutomationPriority(locale, priority);
}

export function labelAssignmentForLocale(locale: string, strategy: string | null | undefined): string {
  return labelTaskAutomationAssignment(locale, strategy);
}

export function formatOffsetMinutesForLocale(
  locale: string,
  minutes: number | null | undefined,
): string {
  return formatTaskAutomationOffsetMinutes(locale, minutes);
}

export function parseApiError(locale: string, error: unknown): string {
  return parseTaskAutomationApiError(locale, error);
}

export function isFieldOverridden(
  provenance: TaskAutomationFieldProvenance | undefined,
): boolean {
  return provenance?.source === 'ORG_OVERRIDE';
}

export function countOverriddenFields(rule: TaskAutomationRuleDto): number {
  return Object.values(rule.fieldProvenance).filter((field) => field.source === 'ORG_OVERRIDE').length;
}

export function buildFormStateFromRule(rule: TaskAutomationRuleDto): TaskAutomationOverrideFormState {
  const checklistOverrides = parseChecklistOverrideForm(rule.effective.checklistOverrides);
  return {
    enabled: rule.effective.enabled,
    activationOffsetMinutes: rule.effective.activationOffsetMinutes,
    dueOffsetMinutes: rule.effective.dueOffsetMinutes,
    priority: rule.effective.priority,
    assignmentStrategy: rule.effective.assignmentStrategy,
    assignedUserId: rule.effective.assignedUserId,
    assignedRoleKey: rule.effective.assignedRoleKey,
    stationScope: rule.effective.stationScope,
    checklistOverrides,
  };
}

export function parseChecklistOverrideForm(
  value: Record<string, unknown> | null,
): TaskAutomationChecklistOverrideForm | null {
  if (!value) return null;
  const hiddenOptionalTitles = Array.isArray(value.hiddenOptionalTitles)
    ? value.hiddenOptionalTitles.filter((item): item is string => typeof item === 'string')
    : [];
  const additionalItems = Array.isArray(value.additionalItems)
    ? value.additionalItems
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({
          title: String(item.title ?? '').trim(),
          description: typeof item.description === 'string' ? item.description : undefined,
          isRequired: item.isRequired === true,
        }))
        .filter((item) => item.title.length > 0)
    : [];
  if (!hiddenOptionalTitles.length && !additionalItems.length) return null;
  return { hiddenOptionalTitles, additionalItems };
}

function valueOrNull<T>(current: T, baseline: T): T | null {
  return current === baseline ? null : current;
}

export function buildOverridePayload(
  rule: TaskAutomationRuleDto,
  form: TaskAutomationOverrideFormState,
): TaskAutomationOverridePayload {
  const payload: TaskAutomationOverridePayload = {};
  const allowed = new Set(rule.allowedOverrideFields);

  if (allowed.has('enabled')) {
    const changed = valueOrNull(form.enabled, rule.default.enabled);
    if (changed !== null) payload.enabled = changed;
  }
  if (allowed.has('activationOffsetMinutes')) {
    const changed = valueOrNull(form.activationOffsetMinutes, rule.default.activationOffsetMinutes);
    if (changed !== null) payload.activationOffsetMinutes = changed;
  }
  if (allowed.has('dueOffsetMinutes')) {
    const changed = valueOrNull(form.dueOffsetMinutes, rule.default.dueOffsetMinutes);
    if (changed !== null) payload.dueOffsetMinutes = changed;
  }
  if (allowed.has('priority')) {
    const changed = valueOrNull(form.priority, rule.default.priority);
    if (changed !== null) payload.priority = changed;
  }
  if (allowed.has('assignmentStrategy')) {
    const changed = valueOrNull(form.assignmentStrategy, rule.default.assignmentStrategy);
    if (changed !== null) payload.assignmentStrategy = changed;
  }
  if (allowed.has('assignedUserId')) {
    const changed = valueOrNull(form.assignedUserId, rule.default.assignedUserId);
    if (changed !== null) payload.assignedUserId = changed;
  }
  if (allowed.has('assignedRoleKey')) {
    const changed = valueOrNull(form.assignedRoleKey, rule.default.assignedRoleKey);
    if (changed !== null) payload.assignedRoleKey = changed;
  }
  if (allowed.has('stationScope')) {
    const changed = valueOrNull(form.stationScope, rule.default.stationScope);
    if (changed !== null) payload.stationScope = changed;
  }
  if (allowed.has('checklistOverrides')) {
    const defaultHidden: string[] = [];
    const defaultAdditional: TaskAutomationChecklistOverrideForm['additionalItems'] = [];
    const current = form.checklistOverrides ?? { hiddenOptionalTitles: [], additionalItems: [] };
    const hiddenChanged =
      JSON.stringify([...current.hiddenOptionalTitles].sort()) !==
      JSON.stringify([...defaultHidden].sort());
    const additionalChanged =
      JSON.stringify(current.additionalItems) !== JSON.stringify(defaultAdditional);
    payload.checklistOverrides =
      hiddenChanged || additionalChanged
        ? {
            hiddenOptionalTitles: current.hiddenOptionalTitles,
            additionalItems: current.additionalItems,
          }
        : null;
  }

  if (rule.audit.version != null) {
    payload.expectedVersion = rule.audit.version;
  }

  return payload;
}

export function formatAuditTimestamp(locale: string, value: string | null): string {
  return formatTaskAutomationAuditTimestamp(locale, value);
}

export function summarizeChecklistState(locale: string, rule: TaskAutomationRuleDto): string {
  return summarizeTaskAutomationChecklistState(locale, rule);
}

export function effectiveFieldValue(
  locale: string,
  defaults: TaskAutomationPlatformDefaults,
  field: keyof TaskAutomationPlatformDefaults,
): string {
  const value = defaults[field];
  if (value == null) return '—';
  if (field === 'priority') return labelTaskAutomationPriority(locale, String(value));
  if (field === 'assignmentStrategy') return labelTaskAutomationAssignment(locale, String(value));
  if (field === 'enabled') {
    return at(locale, value ? 'taskAutomation.enabled.true' : 'taskAutomation.enabled.false');
  }
  if (field === 'activationOffsetMinutes' || field === 'dueOffsetMinutes') {
    return formatTaskAutomationOffsetMinutes(locale, Number(value));
  }
  return String(value);
}
