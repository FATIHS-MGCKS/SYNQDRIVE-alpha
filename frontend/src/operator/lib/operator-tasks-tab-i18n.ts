/**
 * Operator Tasks tab chrome presentation adapter (P2.2.47).
 * Filter/sort machine IDs map to TranslationKey only — no task business semantics.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { ApiTaskPriority } from '../../lib/api';
import type { OperatorTaskScope } from '../tasks/operatorTask.utils';

export type OperatorTasksTabFilterChip = 'today' | 'overdue' | 'vehicle' | 'booking';

export type OperatorTasksTabSummaryKey = 'open' | 'today' | 'overdue';

const FILTER_CHIP_LABEL_KEYS: Record<
  Exclude<OperatorTasksTabFilterChip, 'vehicle' | 'booking'>,
  TranslationKey
> = {
  today: 'common.today',
  overdue: 'status.overdue',
};

const PRIORITY_LABEL_KEYS: Record<ApiTaskPriority, TranslationKey> = {
  CRITICAL: 'tasks.filter.priority.CRITICAL',
  HIGH: 'tasks.filter.priority.HIGH',
  NORMAL: 'tasks.filter.priority.NORMAL',
  LOW: 'tasks.filter.priority.LOW',
};

const SUMMARY_LABEL_KEYS: Record<OperatorTasksTabSummaryKey, TranslationKey> = {
  open: 'tasks.filter.status.OPEN',
  today: 'common.today',
  overdue: 'status.overdue',
};

export function resolveOperatorTasksTabLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function ott(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveOperatorTasksTabLocale(locale), key, vars).text;
}

export function operatorTasksTabListTitle(
  locale: string,
  scope: OperatorTaskScope,
  hasUserId: boolean,
): string {
  if (scope === 'mine' && hasUserId) {
    return ott(locale, 'operator.tasks.tab.title.mine');
  }
  return ott(locale, 'operator.tasks.tab.title.open');
}

export function operatorTasksTabScopeToggleLabel(
  locale: string,
  scope: OperatorTaskScope,
): string {
  return scope === 'mine'
    ? ott(locale, 'operator.tasks.tab.scope.showAll')
    : ott(locale, 'operator.tasks.tab.scope.mineOnly');
}

export function operatorTasksTabSummaryLabel(
  locale: string,
  key: OperatorTasksTabSummaryKey,
): string {
  return ott(locale, SUMMARY_LABEL_KEYS[key]);
}

export function operatorTasksTabFilterChipLabel(
  locale: string,
  chip: OperatorTasksTabFilterChip,
  options?: { vehicleLabel?: string | null; bookingActive?: boolean },
): string {
  if (chip === 'vehicle') {
    return options?.vehicleLabel?.trim() || ott(locale, 'tasks.filter.vehicleLabel');
  }
  if (chip === 'booking') {
    return options?.bookingActive
      ? ott(locale, 'operator.tasks.tab.filter.bookingActive')
      : ott(locale, 'tasks.filter.bookingLabel');
  }
  return ott(locale, FILTER_CHIP_LABEL_KEYS[chip]);
}

export function operatorTasksTabPriorityLabel(
  locale: string,
  priority: ApiTaskPriority | 'all',
): string {
  if (priority === 'all') {
    return ott(locale, 'tasks.filter.priorityLabel');
  }
  return ott(locale, PRIORITY_LABEL_KEYS[priority]);
}

export function operatorTasksTabBookingBannerPrefix(locale: string): string {
  return ott(locale, 'tasks.filter.bookingLabel');
}

export function operatorTasksTabRemoveLabel(locale: string): string {
  return ott(locale, 'common.remove');
}

export function operatorTasksTabCloseLabel(locale: string): string {
  return ott(locale, 'common.close');
}

export function operatorTasksTabEmptyTitle(locale: string): string {
  return ott(locale, 'tasks.empty.open.title');
}

export function operatorTasksTabEmptyDescription(
  locale: string,
  scope: OperatorTaskScope,
): string {
  return scope === 'mine'
    ? ott(locale, 'operator.tasks.tab.empty.mineDescription')
    : ott(locale, 'operator.tasks.tab.empty.allDescription');
}

export function operatorTasksTabDetailPlaceholder(locale: string): string {
  return ott(locale, 'operator.tasks.tab.detailPlaceholder');
}

export function operatorTasksTabBackToList(locale: string): string {
  return ott(locale, 'operator.tasks.tab.backToList');
}

export function operatorTasksTabCreateFabAria(locale: string): string {
  return ott(locale, 'tasks.createTaskButton');
}

export function operatorTasksTabCreateSheetVehicleLabel(locale: string): string {
  return ott(locale, 'tasks.newTask');
}
