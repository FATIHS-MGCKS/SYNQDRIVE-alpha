/**
 * Rental Invoice Payments presentation adapter (P2.2.52).
 * Locale-aware money/date display only — no financial or mutation logic.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { formatInvoiceListAmount, formatInvoiceListDate } from './invoice-list-i18n';

export function resolveRentalInvoicePaymentsLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function formatRentalInvoicePaymentAmount(
  locale: string,
  cents: number,
  currency: string,
): string {
  return formatInvoiceListAmount(
    resolveRentalInvoicePaymentsLocale(locale),
    cents,
    currency,
  );
}

export function formatRentalInvoicePaymentDate(
  locale: string,
  iso: string | null,
): string {
  return formatInvoiceListDate(resolveRentalInvoicePaymentsLocale(locale), iso);
}
