/**
 * Rental Invoice Detail Primary presentation adapter (P2.2.50).
 * Status/type/money/date reuse invoice-list-i18n; no financial or gate eligibility logic.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  formatInvoiceListAmount,
  formatInvoiceListDate,
  labelInvoiceListStatus,
  labelInvoiceListType,
  ili,
} from './invoice-list-i18n';
import type { InvoiceEntityRelation } from '../components/invoices/invoiceDetailTypes';

const RELATION_LABEL_KEYS: Record<InvoiceEntityRelation['kind'], TranslationKey> = {
  customer: 'tasks.entity.customer',
  booking: 'invoices.list.col.booking',
  vehicle: 'invoices.list.col.vehicle',
  vendor: 'tasks.entity.vendor',
};

const TEMPLATE_NAME_KEYS: Record<string, TranslationKey> = {
  standard: 'invoices.create.template.standard.name',
  booking: 'invoices.create.template.booking.name',
  damage: 'invoices.create.template.damage.name',
  extra: 'invoices.create.template.extra.name',
};

export function resolveRentalInvoiceDetailPrimaryLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function ridp(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveRentalInvoiceDetailPrimaryLocale(locale), key, vars).text;
}

export function rentalInvoiceDetailPrimaryStatusLabel(locale: string, status: string): string {
  return labelInvoiceListStatus(locale, status);
}

export function rentalInvoiceDetailPrimaryTypeLabel(locale: string, type: string): string {
  return labelInvoiceListType(locale, type);
}

export function rentalInvoiceDetailPrimaryDraftNumberLabel(locale: string): string {
  return labelInvoiceListStatus(locale, 'DRAFT');
}

export function rentalInvoiceDetailPrimaryFormatAmount(
  locale: string,
  cents: number,
  currency = 'EUR',
): string {
  return formatInvoiceListAmount(locale, cents, currency);
}

export function rentalInvoiceDetailPrimaryFormatDate(locale: string, iso: string | null): string {
  return formatInvoiceListDate(locale, iso);
}

export function rentalInvoiceDetailPrimaryRelationLabel(
  locale: string,
  kind: InvoiceEntityRelation['kind'],
): string {
  return ili(locale, RELATION_LABEL_KEYS[kind]);
}

export function rentalInvoiceDetailPrimaryTemplateName(
  locale: string,
  templateId: string,
  fallbackName: string,
): string {
  const key = TEMPLATE_NAME_KEYS[templateId];
  return key ? ili(locale, key) : fallbackName;
}

export function rentalInvoiceDetailPrimaryFallbackLabel(
  locale: string,
  fallback: 'archived' | 'deleted' | 'unavailable' | 'legacy',
): string {
  return ridp(locale, `rental.invoice.detail.primary.fallback.${fallback}`);
}

export function rentalInvoiceDetailPrimaryPermissionReason(
  locale: string,
  kind: InvoiceEntityRelation['kind'],
): string {
  switch (kind) {
    case 'customer':
      return ridp(locale, 'rental.invoice.detail.primary.permission.customer');
    case 'booking':
      return ridp(locale, 'rental.invoice.detail.primary.permission.booking');
    case 'vehicle':
      return ridp(locale, 'rental.invoice.detail.primary.permission.vehicle');
    default:
      return ridp(locale, 'rental.invoice.detail.primary.permission.default');
  }
}

export function rentalInvoiceDetailPrimaryRentalPeriod(
  locale: string,
  startLabel: string,
  endLabel: string,
): string {
  const empty = ili(locale, 'invoices.list.emptyValue');
  if (startLabel === empty && endLabel === empty) {
    return ridp(locale, 'rental.invoice.detail.primary.period.unknown');
  }
  if (startLabel === empty) {
    return ridp(locale, 'rental.invoice.detail.primary.period.until', { date: endLabel });
  }
  if (endLabel === empty) {
    return ridp(locale, 'rental.invoice.detail.primary.period.from', { date: startLabel });
  }
  return `${startLabel} – ${endLabel}`;
}

export type InvoiceDetailPrimaryGateReasonKey =
  | 'issueNotDraft'
  | 'noPdfYet'
  | 'pdfAlreadyExists'
  | 'pdfOutgoingOnly'
  | 'issueBeforePdf'
  | 'pdfTerminalState'
  | 'pdfTypeUnavailable'
  | 'emailAdminOnly'
  | 'emailOutgoingOnly'
  | 'issueFirst'
  | 'emailNeedsPdf'
  | 'regenerateBookingOnly'
  | 'generatePdfFirst'
  | 'markSentState'
  | 'outgoingOnly'
  | 'paymentStatusBlocked'
  | 'noOutstandingAmount'
  | 'editDraftOrReview'
  | 'cancelNoPermission'
  | 'cancelStatusBlocked';

export function rentalInvoiceDetailPrimaryGateReason(
  locale: string,
  key: InvoiceDetailPrimaryGateReasonKey,
): string {
  return ridp(locale, `rental.invoice.detail.primary.gate.${key}`);
}

export function rentalInvoiceDetailPrimaryAmountTotalLabel(locale: string): string {
  return ili(locale, 'invoices.list.col.total');
}

export function rentalInvoiceDetailPrimaryAmountDueLabel(locale: string): string {
  return ili(locale, 'invoices.list.col.dueDate');
}
