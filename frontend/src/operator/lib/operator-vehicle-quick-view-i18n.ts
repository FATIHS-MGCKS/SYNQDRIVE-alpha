/**
 * Operator Vehicle Quick View — Open Tasks presentation adapter (P2.2.27 QV-G).
 * Machine task status/priority/overdue values stay unchanged.
 */
import type { ApiTaskPriority, ApiTaskStatus } from '../../lib/api';
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  serviceTaskPriorityLabel,
  serviceTaskStatusLabel,
} from '../../lib/tasks/service-task-presentation-i18n';

export function resolveOperatorVehicleQuickViewLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function ovqt(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveOperatorVehicleQuickViewLocale(locale), key, vars).text;
}

export function operatorVehicleQuickViewTasksSectionTitle(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.tasks.sectionTitle');
}

export function operatorVehicleQuickViewTasksNewLabel(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.tasks.new');
}

export function operatorVehicleQuickViewTasksEmptyLabel(locale: string): string {
  return ovqt(locale, 'operator.vehicleQuickView.tasks.empty');
}

export function operatorVehicleQuickViewTaskOpenAriaLabel(
  locale: string,
  title: string,
): string {
  return ovqt(locale, 'operator.vehicleQuickView.tasks.openTaskAria', { title });
}

export function operatorVehicleQuickViewTaskStatusLabel(
  locale: string,
  status: ApiTaskStatus,
  isOverdue: boolean,
): string {
  if (isOverdue) {
    return ovqt(locale, 'status.overdue');
  }
  return serviceTaskStatusLabel(locale, status);
}

export function operatorVehicleQuickViewTaskPriorityLabel(
  locale: string,
  priority: ApiTaskPriority,
): string {
  return serviceTaskPriorityLabel(locale, priority);
}
