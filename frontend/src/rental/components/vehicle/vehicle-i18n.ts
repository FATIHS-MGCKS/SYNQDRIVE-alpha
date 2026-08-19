/**
 * Canonical vehicle-domain copy helpers for non-React builders and display mappers.
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

export function resolveVehicleProductLocale(locale: string | null | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function vt(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveVehicleProductLocale(locale), key, vars).text;
}

export function vehicleFormattingLocale(locale: string): string {
  return getFormattingLocale(resolveVehicleProductLocale(locale));
}

/** Active or fallback BCP-47 tag for vehicle-domain number/date formatting. */
export function vehicleFormattingLocaleOrDefault(locale?: string | null): string {
  return vehicleFormattingLocale(locale ?? DEFAULT_PRODUCT_LOCALE);
}
