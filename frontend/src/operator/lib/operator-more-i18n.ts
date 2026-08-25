/**
 * Operator More View presentation adapter (P2.2.39).
 * Tab IDs, routes, callbacks, and dynamic vehicle labels stay unchanged.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { ThemePreference } from '../../lib/theme';

const THEME_PREFERENCE_KEYS: Record<ThemePreference, TranslationKey> = {
  system: 'operator.more.theme.system',
  light: 'operator.more.theme.light',
  dark: 'operator.more.theme.dark',
};

export function resolveOperatorMoreLocale(locale: string | null | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function om(locale: string, key: TranslationKey): string {
  return translateKey(resolveOperatorMoreLocale(locale), key).text;
}

export function operatorMoreSectionTitle(
  locale: string,
  section: 'actions' | 'navigation' | 'appearance' | 'synqdrive',
): string {
  const key: TranslationKey =
    section === 'actions'
      ? 'operator.more.section.actions'
      : section === 'navigation'
        ? 'operator.more.section.navigation'
        : section === 'appearance'
          ? 'operator.more.section.appearance'
          : 'operator.more.section.synqdrive';
  return om(locale, key);
}

export function operatorMoreCreateBookingTitle(locale: string): string {
  return om(locale, 'operator.bookings.form.createTitle');
}

export function operatorMoreCreateBookingSubtitle(locale: string): string {
  return om(locale, 'operator.more.action.createBooking.subtitle');
}

export function operatorMoreAiUploadTitle(locale: string): string {
  return om(locale, 'operator.more.action.aiUpload.title');
}

export function operatorMoreAiUploadSubtitle(locale: string): string {
  return om(locale, 'operator.more.action.aiUpload.subtitle');
}

export function operatorMoreTireMeasureTitle(locale: string): string {
  return om(locale, 'operator.more.action.tireMeasure.title');
}

export function operatorMoreTireMeasureSubtitle(locale: string): string {
  return om(locale, 'operator.more.action.tireMeasure.subtitle');
}

export function operatorMoreVehiclePickerTitle(locale: string): string {
  return om(locale, 'operator.more.vehiclePicker.title');
}

export function operatorMoreSearchInVehiclesLabel(locale: string): string {
  return om(locale, 'operator.more.vehiclePicker.searchInVehicles');
}

export function operatorMoreScanNavLabel(locale: string): string {
  return om(locale, 'operator.more.nav.scan');
}

export function operatorMoreAppearanceDesignLabel(locale: string): string {
  return om(locale, 'operator.more.appearance.design');
}

export function operatorMoreThemePreferenceLabel(
  locale: string,
  preference: ThemePreference,
): string {
  return om(locale, THEME_PREFERENCE_KEYS[preference]);
}

export function operatorMoreWebAppLinkLabel(locale: string): string {
  return om(locale, 'operator.more.link.webApp');
}

export function operatorMoreInfoBody(locale: string): string {
  return om(locale, 'operator.more.info.body');
}
