/**
 * Operator shell top chrome presentation adapter (P2.2.44).
 * Header sync labels, connectivity copy, and accessibility — no shell/network semantics.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { OperatorSyncState } from './operatorTypes';

export function resolveOperatorShellTopChromeLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function ostc(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveOperatorShellTopChromeLocale(locale), key, vars).text;
}

export function formatOperatorShellHeaderSyncTime(iso: string | null, locale: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function operatorShellHeaderEyebrow(locale: string): string {
  return ostc(locale, 'operator.header.eyebrow');
}

export function operatorShellHeaderAriaLabel(locale: string, localeNativeName: string): string {
  return ostc(locale, 'operator.header.ariaLabel', { localeName: localeNativeName });
}

export function operatorShellHeaderOrgLoadingLabel(locale: string): string {
  return ostc(locale, 'common.loading');
}

export function operatorShellHeaderSyncLabel(
  locale: string,
  syncState: OperatorSyncState,
  formattingLocale: string,
): string {
  if (syncState.loading) {
    return ostc(locale, 'operator.header.sync.loading');
  }
  if (syncState.error) {
    return ostc(locale, 'operator.header.sync.error');
  }
  if (syncState.lastSyncAt) {
    return formatOperatorShellHeaderSyncTime(syncState.lastSyncAt, formattingLocale);
  }
  return ostc(locale, 'operator.header.sync.empty');
}

export function operatorShellHeaderRefreshTitle(locale: string): string {
  return ostc(locale, 'operator.header.refreshTitle');
}

export function operatorShellHeaderAppLinkLabel(locale: string): string {
  return ostc(locale, 'operator.header.appLink');
}

export function operatorShellConnectivityOfflineMessage(locale: string): string {
  return ostc(locale, 'operator.connectivity.offlineMessage');
}
