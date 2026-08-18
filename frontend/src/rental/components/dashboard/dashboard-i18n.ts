/**
 * Canonical dashboard copy helpers for non-React builders and display mappers.
 * React surfaces should prefer `useLanguage().t()` where practical.
 */
import { getFormattingLocale, type SupportedLocale } from '../../../i18n/locales';
import { translateKey } from '../../../i18n/LanguageContext';
import type { TranslationKey } from '../../../i18n/translations/en';

export function resolveDashboardProductLocale(locale: string): SupportedLocale {
  return locale === 'de' ? 'de' : 'en';
}

export function dt(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveDashboardProductLocale(locale), key, vars).text;
}

export function dashboardFormattingLocale(locale: string): string {
  return getFormattingLocale(resolveDashboardProductLocale(locale));
}
