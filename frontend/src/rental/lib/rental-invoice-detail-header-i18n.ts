/**
 * Rental Invoice Detail Header presentation adapter (P2.2.50).
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

export function resolveRentalInvoiceDetailHeaderLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function ridh(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveRentalInvoiceDetailHeaderLocale(locale), key, vars).text;
}

export function rentalInvoiceDetailHeaderStatusLabel(locale: string, status: string): string {
  return labelInvoiceListStatus(locale, status);
}

export function rentalInvoiceDetailHeaderTypeLabel(locale: string, type: string): string {
  return labelInvoiceListType(locale, type);
}

export function rentalInvoiceDetailHeaderDraftNumberLabel(locale: string): string {
  return labelInvoiceListStatus(locale, 'DRAFT');
}

export function rentalInvoiceDetailHeaderFormatAmount(
  locale: string,
  cents: number,
  currency = 'EUR',
): string {
  return formatInvoiceListAmount(locale, cents, currency);
}

export function rentalInvoiceDetailHeaderFormatDate(locale: string, iso: string | null): string {
  return formatInvoiceListDate(locale, iso);
}

export function rentalInvoiceDetailHeaderAmountTotalLabel(locale: string): string {
  return ili(locale, 'invoices.list.col.total');
}

export function rentalInvoiceDetailHeaderAmountPaidLabel(locale: string): string {
  return ili(locale, 'invoicePayment.summary.paid');
}

export function rentalInvoiceDetailHeaderAmountOutstandingLabel(locale: string): string {
  return ili(locale, 'invoicePayment.summary.outstanding');
}

export function rentalInvoiceDetailHeaderAmountDueLabel(locale: string): string {
  return ili(locale, 'invoices.list.sort.dueDate');
}

export function rentalInvoiceDetailHeaderInvoiceDateLabel(locale: string): string {
  return ili(locale, 'invoices.create.field.invoiceDate');
}

export type InvoiceDetailHeaderGateReasonKey =
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

export function rentalInvoiceDetailHeaderGateReason(
  locale: string,
  key: InvoiceDetailHeaderGateReasonKey,
): string {
  return ridh(locale, `rental.invoice.detail.header.gate.${key}`);
}
