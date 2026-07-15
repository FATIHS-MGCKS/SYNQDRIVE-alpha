import type {
  TaskAutomationChecklistOverrideForm,
  TaskAutomationConfigSource,
  TaskAutomationFieldProvenance,
  TaskAutomationOverrideFormState,
  TaskAutomationOverridePayload,
  TaskAutomationPlatformDefaults,
  TaskAutomationRuleDto,
} from './task-automation.types';

const PRIORITY_LABELS_DE: Record<string, string> = {
  LOW: 'Niedrig',
  NORMAL: 'Normal',
  HIGH: 'Hoch',
  CRITICAL: 'Kritisch',
};

const ASSIGNMENT_LABELS_DE: Record<string, string> = {
  UNASSIGNED: 'Nicht zugewiesen',
  STATION_FROM_BOOKING: 'Station der Buchung',
  INHERIT_FROM_CONTEXT: 'Aus Kontext übernehmen',
};

export function labelTaskAutomationSourceDe(source: TaskAutomationConfigSource | null | undefined): string {
  if (source === 'ORG_OVERRIDE') return 'Eigene Anpassung';
  return 'SynqDrive-Standard';
}

export function labelPriorityDe(priority: string | null | undefined): string {
  if (!priority) return '—';
  return PRIORITY_LABELS_DE[priority] ?? priority;
}

export function labelAssignmentDe(strategy: string | null | undefined): string {
  if (!strategy) return '—';
  return ASSIGNMENT_LABELS_DE[strategy] ?? strategy;
}

export function formatOffsetMinutesDe(minutes: number | null | undefined): string {
  if (minutes == null || minutes === 0) return 'Zum Standardzeitpunkt';
  const abs = Math.abs(minutes);
  const sign = minutes < 0 ? 'früher' : 'später';
  if (abs % 1440 === 0) {
    const days = abs / 1440;
    return `${days} Tag${days === 1 ? '' : 'e'} ${sign}`;
  }
  if (abs % 60 === 0) {
    const hours = abs / 60;
    return `${hours} Stunde${hours === 1 ? '' : 'n'} ${sign}`;
  }
  return `${abs} Minute${abs === 1 ? '' : 'n'} ${sign}`;
}

export function isFieldOverridden(
  provenance: TaskAutomationFieldProvenance | undefined,
): boolean {
  return provenance?.source === 'ORG_OVERRIDE';
}

export function countOverriddenFields(rule: TaskAutomationRuleDto): number {
  return Object.values(rule.fieldProvenance).filter((field) => field.source === 'ORG_OVERRIDE').length;
}

export function parseApiError(error: unknown): string {
  if (error && typeof error === 'object') {
    const maybe = error as { message?: string; error?: string };
    if (maybe.message) return maybe.message;
    if (maybe.error) return maybe.error;
  }
  if (typeof error === 'string') return error;
  return 'Ein unerwarteter Fehler ist aufgetreten.';
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

export function formatAuditTimestamp(value: string | null): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function summarizeChecklistState(rule: TaskAutomationRuleDto): string {
  if (!rule.checklist.allowsOverride || rule.checklist.usesSynqDriveStandard) {
    return rule.checklistTemplateLabelDe;
  }
  const hiddenCount = rule.checklist.platformItems.filter((item) => item.hidden).length;
  const addedCount = rule.checklist.effectiveItems.filter((item) => item.source === 'ORG_OVERRIDE').length;
  const parts = ['Eigene Anpassung'];
  if (hiddenCount > 0) parts.push(`${hiddenCount} optional ausgeblendet`);
  if (addedCount > 0) parts.push(`${addedCount} zusätzlich`);
  return parts.join(' · ');
}

export function effectiveFieldValue(
  defaults: TaskAutomationPlatformDefaults,
  field: keyof TaskAutomationPlatformDefaults,
): string {
  const value = defaults[field];
  if (value == null) return '—';
  if (field === 'priority') return labelPriorityDe(String(value));
  if (field === 'assignmentStrategy') return labelAssignmentDe(String(value));
  if (field === 'enabled') return value ? 'Aktiv' : 'Inaktiv';
  if (field === 'activationOffsetMinutes' || field === 'dueOffsetMinutes') {
    return formatOffsetMinutesDe(Number(value));
  }
  return String(value);
}
