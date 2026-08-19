/**
 * Canonical customers-domain copy helpers for non-React builders and display mappers.
 * React surfaces should prefer `useLanguage().t()` where practical.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  getFormattingLocale,
  isSupportedLocale,
  type SupportedLocale,
} from '../../../i18n/locales';
import { translateKey } from '../../../i18n/LanguageContext';
import type { TranslationKey } from '../../../i18n/translations/en';

export function resolveCustomersProductLocale(locale: string | null | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function ct(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveCustomersProductLocale(locale), key, vars).text;
}

export function customersFormattingLocale(locale: string): string {
  return getFormattingLocale(resolveCustomersProductLocale(locale));
}

export function customersFormattingLocaleOrDefault(locale?: string | null): string {
  return customersFormattingLocale(locale ?? DEFAULT_PRODUCT_LOCALE);
}
