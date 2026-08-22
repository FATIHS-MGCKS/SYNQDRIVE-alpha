/**
 * Rental Send Invoice Dialog presentation helpers.
 * Email payload fields, invoice IDs, and recipient resolution stay unchanged.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';

export const SEND_INVOICE_ERROR_RECIPIENT_KEY =
  'invoices.send.error.recipientRequired' as const;

export function resolveSendInvoiceLocale(locale: string | null | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function si(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveSendInvoiceLocale(locale), key, vars).text;
}

export function buildSendInvoiceDefaultBody(locale: string, invoiceNumber: string): string {
  return si(locale, 'invoices.send.defaultBody', { number: invoiceNumber });
}
