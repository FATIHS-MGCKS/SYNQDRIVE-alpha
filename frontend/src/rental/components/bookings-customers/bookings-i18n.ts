/**
 * Canonical bookings-domain copy helpers for non-React builders and display mappers.
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

export function resolveBookingsProductLocale(locale: string | null | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function bt(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveBookingsProductLocale(locale), key, vars).text;
}

export function bookingsFormattingLocale(locale: string): string {
  return getFormattingLocale(resolveBookingsProductLocale(locale));
}

export function bookingsFormattingLocaleOrDefault(locale?: string | null): string {
  return bookingsFormattingLocale(locale ?? DEFAULT_PRODUCT_LOCALE);
}
