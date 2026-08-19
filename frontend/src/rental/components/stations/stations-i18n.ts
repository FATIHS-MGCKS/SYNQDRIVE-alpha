/**
 * Canonical stations-domain copy helpers for non-React station booking utilities.
 * React surfaces should prefer `useLanguage().t()` where practical.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../../i18n/locales';
import { translateKey } from '../../../i18n/LanguageContext';
import type { TranslationKey } from '../../../i18n/translations/en';
import type { StationBookingWarning } from '../../lib/stationBookingUtils';

export function resolveStationsProductLocale(locale: string | null | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function st(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveStationsProductLocale(locale), key, vars).text;
}

const STATION_WARNING_KEYS: Record<StationBookingWarning, TranslationKey> = {
  pickupDisabled: 'stations.select.warning.pickupDisabled',
  returnDisabled: 'stations.select.warning.returnDisabled',
  archived: 'stations.status.ARCHIVED',
  inactive: 'stations.status.INACTIVE',
};

export function labelStationWarning(locale: string, code: StationBookingWarning): string {
  return st(locale, STATION_WARNING_KEYS[code]);
}
