import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import type { TranslationKey } from '../../i18n/translations/en';

export function fleetChatUiLabel(key: TranslationKey, locale: 'de' | 'en' = 'de'): string {
  const dict = locale === 'en' ? en : de;
  return dict[key] ?? en[key] ?? key;
}
