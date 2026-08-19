/**
 * Canonical automation-domain copy helpers for non-React builders and display mappers.
 * React surfaces should prefer `useLanguage().t()` where practical.
 */
import type { ApiTaskPriority } from '../../../lib/api';
import {
  DEFAULT_PRODUCT_LOCALE,
  getFormattingLocale,
  isSupportedLocale,
  type SupportedLocale,
} from '../../../i18n/locales';
import { translateKey } from '../../../i18n/LanguageContext';
import type { TranslationKey } from '../../../i18n/translations/en';
import type { TaskAutomationConfigSource } from './task-automation.types';

export function resolveAutomationProductLocale(locale: string | null | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function at(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveAutomationProductLocale(locale), key, vars).text;
}

export function automationFormattingLocale(locale: string): string {
  return getFormattingLocale(resolveAutomationProductLocale(locale));
}

export function automationFormattingLocaleOrDefault(locale?: string | null): string {
  return automationFormattingLocale(locale ?? DEFAULT_PRODUCT_LOCALE);
}

const TASK_PRIORITY_KEYS: Record<ApiTaskPriority, TranslationKey> = {
  LOW: 'tasks.filter.priority.LOW',
  NORMAL: 'tasks.filter.priority.NORMAL',
  HIGH: 'tasks.filter.priority.HIGH',
  CRITICAL: 'tasks.filter.priority.CRITICAL',
};

const ASSIGNMENT_STRATEGY_KEYS: Record<string, TranslationKey> = {
  UNASSIGNED: 'taskAutomation.assignment.UNASSIGNED',
  STATION_FROM_BOOKING: 'taskAutomation.assignment.STATION_FROM_BOOKING',
  INHERIT_FROM_CONTEXT: 'taskAutomation.assignment.INHERIT_FROM_CONTEXT',
};

export function labelTaskAutomationSource(
  locale: string,
  source: TaskAutomationConfigSource | null | undefined,
): string {
  if (source === 'ORG_OVERRIDE') return at(locale, 'taskAutomation.source.orgOverride');
  return at(locale, 'taskAutomation.source.platformDefault');
}

export function labelTaskAutomationPriority(
  locale: string,
  priority: string | null | undefined,
): string {
  if (!priority) return '—';
  const key = TASK_PRIORITY_KEYS[priority as ApiTaskPriority];
  return key ? at(locale, key) : priority;
}

export function labelTaskAutomationAssignment(
  locale: string,
  strategy: string | null | undefined,
): string {
  if (!strategy) return '—';
  const key = ASSIGNMENT_STRATEGY_KEYS[strategy];
  return key ? at(locale, key) : strategy;
}

export function formatTaskAutomationOffsetMinutes(
  locale: string,
  minutes: number | null | undefined,
): string {
  if (minutes == null || minutes === 0) return at(locale, 'taskAutomation.offset.default');
  const abs = Math.abs(minutes);
  const earlier = minutes < 0;
  if (abs % 1440 === 0) {
    const days = abs / 1440;
    return at(locale, earlier ? 'taskAutomation.offset.daysEarlier' : 'taskAutomation.offset.daysLater', {
      count: days,
    });
  }
  if (abs % 60 === 0) {
    const hours = abs / 60;
    return at(locale, earlier ? 'taskAutomation.offset.hoursEarlier' : 'taskAutomation.offset.hoursLater', {
      count: hours,
    });
  }
  return at(locale, earlier ? 'taskAutomation.offset.minutesEarlier' : 'taskAutomation.offset.minutesLater', {
    count: abs,
  });
}

export function formatTaskAutomationAuditTimestamp(
  locale: string,
  value: string | null,
): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(automationFormattingLocale(locale), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function summarizeTaskAutomationChecklistState(
  locale: string,
  rule: {
    checklistTemplateLabelDe: string;
    checklist: {
      allowsOverride: boolean;
      usesSynqDriveStandard: boolean;
      platformItems: Array<{ hidden?: boolean }>;
      effectiveItems: Array<{ source?: string }>;
    };
  },
): string {
  if (!rule.checklist.allowsOverride || rule.checklist.usesSynqDriveStandard) {
    return rule.checklistTemplateLabelDe;
  }
  const hiddenCount = rule.checklist.platformItems.filter((item) => item.hidden).length;
  const addedCount = rule.checklist.effectiveItems.filter((item) => item.source === 'ORG_OVERRIDE').length;
  const parts = [at(locale, 'taskAutomation.checklist.custom')];
  if (hiddenCount > 0) {
    parts.push(at(locale, 'taskAutomation.checklist.hiddenOptional', { count: hiddenCount }));
  }
  if (addedCount > 0) {
    parts.push(at(locale, 'taskAutomation.checklist.added', { count: addedCount }));
  }
  return parts.join(' · ');
}

export function parseTaskAutomationApiError(locale: string, error: unknown): string {
  if (error && typeof error === 'object') {
    const maybe = error as { message?: string; error?: string };
    if (maybe.message) return maybe.message;
    if (maybe.error) return maybe.error;
  }
  if (typeof error === 'string') return error;
  return at(locale, 'taskAutomation.error.unexpected');
}

export function taskAutomationMissingOrgError(locale: string): string {
  return at(locale, 'taskAutomation.error.missingOrg');
}

export function workflowMissingOrgError(locale: string): string {
  return at(locale, 'workflowAutomation.legacy.error.missingOrg');
}

export function workflowRuntimeApiError(locale: string, error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return at(locale, 'workflowAutomation.legacy.error.requestFailed');
}

export function legacyCategoryLabel(locale: string, key: string): string {
  const translationKey = `workflowAutomation.legacy.category.${key}` as TranslationKey;
  const text = at(locale, translationKey);
  return text !== translationKey ? text : key;
}

export function legacyTriggerLabel(locale: string, key: string): string {
  const translationKey = `workflowAutomation.legacy.trigger.${key}` as TranslationKey;
  const text = at(locale, translationKey);
  return text !== translationKey ? text : key;
}

export function legacyActionTypeLabel(locale: string, key: string): string {
  const translationKey = `workflowAutomation.legacy.actionType.${key}` as TranslationKey;
  const text = at(locale, translationKey);
  return text !== translationKey ? text : key;
}

export function legacyConditionFieldLabel(locale: string, key: string): string {
  const translationKey = `workflowAutomation.legacy.conditionField.${key}` as TranslationKey;
  const text = at(locale, translationKey);
  return text !== translationKey ? text : key;
}

export function legacyConditionOperatorLabel(locale: string, key: string): string {
  const translationKey = `workflowAutomation.legacy.conditionOperator.${key}` as TranslationKey;
  const text = at(locale, translationKey);
  return text !== translationKey ? text : key;
}

export function legacyScopeLabel(locale: string, key: string): string {
  const translationKey = `workflowAutomation.legacy.scope.${key}` as TranslationKey;
  const text = at(locale, translationKey);
  return text !== translationKey ? text : key;
}

export function legacyWorkflowStatusLabel(locale: string, status: string): string {
  const translationKey = `workflowAutomation.status.${status}` as TranslationKey;
  const text = at(locale, translationKey);
  return text !== translationKey ? text : status;
}

export function legacyRunStatusLabel(locale: string, status: string): string {
  const translationKey = `workflowAutomation.legacy.runStatus.${status}` as TranslationKey;
  const text = at(locale, translationKey);
  return text !== translationKey ? text : status;
}

export function formatLegacyRelativeTime(
  locale: string,
  dateStr: string | null,
): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return at(locale, 'workflowAutomation.legacy.relative.justNow');
  if (mins < 60) return at(locale, 'workflowAutomation.legacy.relative.minutes', { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return at(locale, 'workflowAutomation.legacy.relative.hours', { count: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 30) return at(locale, 'workflowAutomation.legacy.relative.days', { count: days });
  return d.toLocaleDateString(automationFormattingLocale(locale));
}
