/**
 * Rental compatibility bridge for the canonical SynqDrive platform i18n runtime.
 *
 * Existing Rental imports may continue to target this module during Integration 2+.
 * Locale state and persistence delegate to `frontend/src/i18n/LanguageContext.tsx`.
 * Translation lookup prefers the canonical dictionary and falls back to legacy
 * Rental dictionaries for keys not yet migrated.
 */
import { useCallback } from 'react';
import {
  LanguageProvider,
  translateKey as translateCanonicalKey,
  useLanguage as useCanonicalLanguage,
  type Locale as CanonicalLocale,
  type SupportedLocale,
} from '../../i18n/LanguageContext';
import { cs } from './translations/cs';
import { de } from './translations/de';
import { en, type TranslationKey } from './translations/en';
import { es } from './translations/es';
import { fr } from './translations/fr';
import { it } from './translations/it';
import { nl } from './translations/nl';
import { pl } from './translations/pl';

export type Locale = CanonicalLocale;

const rentalDictionaries: Partial<Record<SupportedLocale, Record<string, string>>> = {
  en,
  de,
  fr,
  nl,
  es,
  it,
  pl,
  cs,
};

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  let result = text;
  for (const [name, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${name}}`, String(value));
  }
  return result;
}

function translateRentalFallback(
  locale: SupportedLocale,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const dictionary = rentalDictionaries[locale] ?? rentalDictionaries.en ?? en;
  const text = dictionary[key] ?? rentalDictionaries.en?.[key] ?? en[key] ?? key;
  return interpolate(text, vars);
}

export function useLanguage() {
  const canonical = useCanonicalLanguage();

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      const canonicalResult = translateCanonicalKey(
        canonical.locale,
        key as Parameters<typeof translateCanonicalKey>[1],
        vars,
      );
      if (canonicalResult.source !== 'missing-key') {
        return canonicalResult.text;
      }
      return translateRentalFallback(canonical.locale, key, vars);
    },
    [canonical.locale],
  );

  return {
    locale: canonical.locale,
    setLocale: canonical.setLocale,
    t,
  };
}

export {
  LanguageProvider,
  translateKey,
  syncDocumentLanguage,
  usesLocaleDictionary,
  type TranslationSource,
  type TranslateResult,
  type LocaleMetadata,
} from '../../i18n/LanguageContext';

export { LOCALE_STORAGE_KEY } from '../../i18n/locales';

export type { TranslationKey };
