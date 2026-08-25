/**
 * Operator Scan Search UX presentation adapter (P2.2.42).
 * Query state, search semantics, callbacks, and dynamic data stay unchanged.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';

export function resolveOperatorScanSearchLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function oss(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveOperatorScanSearchLocale(locale), key, vars).text;
}

export function operatorScanSearchPlaceholder(locale: string): string {
  return oss(locale, 'operator.scan.searchPlaceholder');
}

export function operatorScanScannerTitle(locale: string): string {
  return oss(locale, 'operator.scan.scannerTitle');
}

export function operatorScanScannerHint(locale: string): string {
  return oss(locale, 'operator.scan.scannerHint');
}

export function operatorScanEmptyQueryTitle(locale: string): string {
  return oss(locale, 'operator.scan.emptyQueryTitle');
}

export function operatorScanEmptyQueryDescription(locale: string): string {
  return oss(locale, 'operator.scan.emptyQueryDescription');
}

export function operatorScanNoResultsTitle(locale: string): string {
  return oss(locale, 'operator.scan.noResultsTitle');
}

export function operatorScanNoResultsDescription(locale: string): string {
  return oss(locale, 'operator.scan.noResultsDescription');
}

export function operatorScanSectionBookingsLabel(locale: string): string {
  return oss(locale, 'nav.bookings');
}

export function operatorScanSectionVehiclesLabel(locale: string): string {
  return oss(locale, 'operator.scan.sectionVehicles');
}

export function operatorScanTabletPlaceholder(locale: string): string {
  return oss(locale, 'operator.scan.tabletPlaceholder');
}

export function operatorScanBackToSearchLabel(locale: string): string {
  return oss(locale, 'operator.scan.backToSearch');
}
