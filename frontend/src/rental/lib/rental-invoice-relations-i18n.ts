/**
 * Rental Invoice Relations presentation adapter (P2.2.51).
 * Fallback machine values map to TranslationKey only — no permission or navigation logic.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import { labelCreateInvoiceTemplateName } from './create-invoice-i18n';
import { formatInvoiceListDate } from './invoice-list-i18n';
import type {
  InvoiceEntityRelation,
  InvoiceRelationFallback,
} from '../components/invoices/invoiceDetailTypes';

const EMPTY_DATE_LABEL = '—';

const ENTITY_LABEL_KEYS: Record<InvoiceEntityRelation['kind'], TranslationKey> = {
  customer: 'bookings.customer',
  booking: 'tasks.entity.booking',
  vehicle: 'bookings.vehicle',
  vendor: 'tasks.entity.vendor',
};

const RELATION_FALLBACK_KEYS: Record<
  Exclude<InvoiceRelationFallback, 'legacy'>,
  TranslationKey
> = {
  archived: 'rental.invoice.relations.fallback.archived',
  deleted: 'rental.invoice.relations.fallback.deleted',
  unavailable: 'rental.invoice.relations.fallback.unavailable',
};

export function resolveRentalInvoiceRelationsLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function rir(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveRentalInvoiceRelationsLocale(locale), key, vars).text;
}

export function rentalInvoiceRelationsSectionTitle(locale: string): string {
  return rir(locale, 'rental.invoice.relations.section.title');
}

export function rentalInvoiceRelationsTemplateLabel(locale: string): string {
  return rir(locale, 'rental.invoice.relations.label.template');
}

export function rentalInvoiceRelationsEntityLabel(
  locale: string,
  kind: InvoiceEntityRelation['kind'],
): string {
  return rir(locale, ENTITY_LABEL_KEYS[kind]);
}

export function rentalInvoiceRelationsFallbackLabel(
  locale: string,
  fallback: Exclude<InvoiceRelationFallback, 'legacy'>,
): string {
  return rir(locale, RELATION_FALLBACK_KEYS[fallback]);
}

export function rentalInvoiceRelationsPermissionBlockedReason(
  locale: string,
  kind: InvoiceEntityRelation['kind'],
  canRead: boolean,
): string | null {
  if (canRead) return null;
  switch (kind) {
    case 'customer':
      return rir(locale, 'rental.invoice.relations.permission.customer');
    case 'booking':
      return rir(locale, 'rental.invoice.relations.permission.booking');
    case 'vehicle':
      return rir(locale, 'rental.invoice.relations.permission.vehicle');
    default:
      return rir(locale, 'rental.invoice.relations.permission.generic');
  }
}

export function formatRentalInvoiceRelationsPeriod(
  locale: string,
  start: string,
  end: string,
): string {
  const startLabel = formatInvoiceListDate(locale, start);
  const endLabel = formatInvoiceListDate(locale, end);
  if (startLabel === EMPTY_DATE_LABEL && endLabel === EMPTY_DATE_LABEL) {
    return rir(locale, 'rental.invoice.relations.period.unknown');
  }
  if (startLabel === EMPTY_DATE_LABEL) {
    return rir(locale, 'rental.invoice.relations.period.until', { date: endLabel });
  }
  if (endLabel === EMPTY_DATE_LABEL) {
    return rir(locale, 'rental.invoice.relations.period.from', { date: startLabel });
  }
  return rir(locale, 'rental.invoice.relations.period.range', {
    start: startLabel,
    end: endLabel,
  });
}

export function rentalInvoiceRelationsTemplateDisplayName(
  locale: string,
  templateId: string,
): string {
  return labelCreateInvoiceTemplateName(locale, templateId);
}

export function rentalInvoiceRelationsRowAriaLabel(
  locale: string,
  kind: InvoiceEntityRelation['kind'],
  primary: string,
): string {
  return `${rentalInvoiceRelationsEntityLabel(locale, kind)}: ${primary}`;
}
