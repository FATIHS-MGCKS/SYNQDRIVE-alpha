/**
 * Rental Invoice Documents panel presentation helpers.
 * Document IDs, filenames, URLs, MIME types, and API payloads stay unchanged.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  getFormattingLocale,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';

export function resolveInvoiceDocumentsLocale(locale: string | null | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function idoc(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveInvoiceDocumentsLocale(locale), key, vars).text;
}

export function invoiceDocumentsFormattingLocale(locale: string): string {
  return getFormattingLocale(resolveInvoiceDocumentsLocale(locale));
}

export function formatInvoiceDocumentDateTime(
  locale: string,
  iso: string | null | undefined,
): string {
  if (!iso) {
    return idoc(locale, 'invoices.list.emptyValue');
  }
  return new Date(iso).toLocaleString(invoiceDocumentsFormattingLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
