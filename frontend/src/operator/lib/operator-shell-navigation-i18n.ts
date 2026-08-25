/**
 * Operator shell bottom navigation presentation adapter (P2.2.43).
 * Tab machine IDs, callbacks, ordering, and visibility stay unchanged.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { OperatorTab } from './operatorTypes';

const OPERATOR_SHELL_NAV_TAB_LABEL_KEYS: Record<OperatorTab, TranslationKey> = {
  today: 'common.today',
  scan: 'operator.navigation.tab.scan',
  vehicles: 'operator.navigation.tab.vehicles',
  tasks: 'nav.tasks',
  more: 'operator.navigation.tab.more',
};

export function resolveOperatorShellNavigationLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function osn(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveOperatorShellNavigationLocale(locale), key, vars).text;
}

export function operatorShellNavigationTabLabel(locale: string, tab: OperatorTab): string {
  return osn(locale, OPERATOR_SHELL_NAV_TAB_LABEL_KEYS[tab]);
}

export function operatorShellNavigationAriaLabel(locale: string): string {
  return osn(locale, 'operator.navigation.ariaLabel');
}
