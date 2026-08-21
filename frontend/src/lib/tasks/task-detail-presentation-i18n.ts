/**
 * Canonical Task Detail chrome presentation adapter (P2.2.16C.1).
 * Machine task/status/priority/linked-object values stay unchanged.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  getFormattingLocale,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { ApiTaskPriority, ApiTaskStatus, ApiTaskType } from '../api';
import type { ApiTask } from '../api';
import type { TaskLinkedObject } from './types';
import {
  serviceTaskPriorityLabel,
  serviceTaskStatusLabel,
  serviceTaskTypeLabel,
} from './service-task-presentation-i18n';

export function resolveTaskDetailPresentationLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function tdp(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveTaskDetailPresentationLocale(locale), key, vars).text;
}

const LINKED_OBJECT_TYPE_KEYS: Record<TaskLinkedObject['type'], TranslationKey> = {
  VEHICLE: 'tasks.detail.linked.VEHICLE',
  BOOKING: 'tasks.detail.linked.BOOKING',
  CUSTOMER: 'tasks.detail.linked.CUSTOMER',
  INVOICE: 'tasks.detail.linked.INVOICE',
  DOCUMENT: 'tasks.detail.linked.DOCUMENT',
  ALERT: 'tasks.detail.linked.ALERT',
  SERVICE_CASE: 'tasks.detail.linked.SERVICE_CASE',
  FINE: 'tasks.detail.linked.FINE',
  VENDOR: 'tasks.detail.linked.VENDOR',
};

export function taskDetailLinkedObjectTypeLabel(
  locale: string,
  type: TaskLinkedObject['type'],
): string {
  return tdp(locale, LINKED_OBJECT_TYPE_KEYS[type] ?? 'tasks.detail.linked.ALERT');
}

export function taskDetailStatusLabel(locale: string, status: ApiTaskStatus): string {
  return serviceTaskStatusLabel(locale, status);
}

export function taskDetailPriorityLabel(locale: string, priority: ApiTaskPriority): string {
  return serviceTaskPriorityLabel(locale, priority);
}

export function taskDetailTypeLabel(
  locale: string,
  task: {
    type: ApiTaskType;
    metadata?: ApiTask['metadata'];
    category?: string | null;
  },
): string {
  return serviceTaskTypeLabel(locale, {
    type: task.type,
    metadata: task.metadata ?? null,
    category: task.category ?? '',
  });
}

export function taskDetailEmDash(locale: string): string {
  return tdp(locale, 'tasks.display.emDash');
}

export function taskDetailUnassignedLabel(locale: string): string {
  return tdp(locale, 'tasks.display.unassigned');
}

export function formatTaskDetailDateTime(locale: string, iso?: string | null): string {
  if (!iso) return taskDetailEmDash(locale);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return taskDetailEmDash(locale);
  const resolved = resolveTaskDetailPresentationLocale(locale);
  return date.toLocaleString(getFormattingLocale(resolved), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTaskDetailDate(locale: string, iso?: string | null): string {
  if (!iso) return taskDetailEmDash(locale);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return taskDetailEmDash(locale);
  const resolved = resolveTaskDetailPresentationLocale(locale);
  return date.toLocaleDateString(getFormattingLocale(resolved), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatTaskDetailDueCompact(locale: string, iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const resolved = resolveTaskDetailPresentationLocale(locale);
  return date.toLocaleString(getFormattingLocale(resolved), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function taskDetailTimingDueLabel(locale: string, formattedDate: string): string {
  return tdp(locale, 'tasks.detail.timing.due', { date: formattedDate });
}

export function taskDetailTimingActiveFromLabel(locale: string, formattedDate: string): string {
  return tdp(locale, 'tasks.detail.timing.activeFrom', { date: formattedDate });
}

export function taskDetailChecklistProgressLabel(
  locale: string,
  completed: number,
  total: number,
): string {
  return tdp(locale, 'tasks.detail.checklist.progressLabel', { completed, total });
}

export function taskDetailChecklistBlockerLabel(
  locale: string,
  openRequiredTitles: string[],
): string {
  if (openRequiredTitles.length === 0) {
    return tdp(locale, 'tasks.detail.checklist.blockerGeneric');
  }
  if (openRequiredTitles.length === 1) {
    return tdp(locale, 'tasks.detail.checklist.blockerSingle', {
      title: openRequiredTitles[0] ?? '',
    });
  }
  return tdp(locale, 'tasks.detail.checklist.blockerPlural', {
    count: openRequiredTitles.length,
  });
}

export function taskDetailChecklistLegacyHint(locale: string): string {
  return tdp(locale, 'tasks.detail.checklist.legacyHint');
}
