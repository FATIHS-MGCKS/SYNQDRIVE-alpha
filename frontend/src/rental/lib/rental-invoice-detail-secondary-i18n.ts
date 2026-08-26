/**
 * Rental Invoice Detail Secondary presentation adapter (P2.2.49).
 * Linked task machine statuses map to TranslationKey only — no task semantics.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  getFormattingLocale,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';

const LINKED_TASK_STATUS_KEYS: Record<string, TranslationKey> = {
  OPEN: 'tasks.filter.status.OPEN',
  IN_PROGRESS: 'tasks.filter.status.IN_PROGRESS',
  DONE: 'tasks.filter.status.DONE',
  COMPLETED: 'tasks.filter.status.DONE',
  CANCELLED: 'tasks.filter.status.CANCELLED',
};

export function resolveRentalInvoiceDetailSecondaryLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function rids(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveRentalInvoiceDetailSecondaryLocale(locale), key, vars).text;
}

export function rentalInvoiceDetailSecondaryFormattingLocale(locale: string): string {
  return getFormattingLocale(resolveRentalInvoiceDetailSecondaryLocale(locale));
}

export function rentalInvoiceDetailSecondaryLinkedTaskStatusLabel(
  locale: string,
  status: string,
): string {
  const key = LINKED_TASK_STATUS_KEYS[status] ?? 'tasks.filter.status.OPEN';
  return rids(locale, key);
}

export function rentalInvoiceDetailSecondaryDefaultTaskTitle(locale: string): string {
  return rids(locale, 'rental.invoice.detail.secondary.task.defaultTitle');
}

export function rentalInvoiceDetailSecondaryTimelineExpandLabel(locale: string): string {
  return rids(locale, 'notification.expandDetails');
}

export function rentalInvoiceDetailSecondaryTimelineCollapseLabel(locale: string): string {
  return rids(locale, 'dashboard.attention.showLess');
}

export function formatRentalInvoiceDetailSecondaryTimelineDateTime(
  locale: string,
  iso: string,
  timeZone: string,
): string {
  try {
    return new Intl.DateTimeFormat(rentalInvoiceDetailSecondaryFormattingLocale(locale), {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: timeZone || 'Europe/Berlin',
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString(rentalInvoiceDetailSecondaryFormattingLocale(locale), {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }
}
