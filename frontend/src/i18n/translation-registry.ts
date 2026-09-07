import type { SupportedLocale } from './locales';
import type {
  CompleteTranslationDictionary,
  PartialTranslationDictionary,
} from './dictionary-types';
import { cs } from './translations/cs';
import { de } from './translations/de';
import { en } from './translations/en';
import { es } from './translations/es';
import { fr } from './translations/fr';
import { it } from './translations/it';
import { nl } from './translations/nl';
import { pl } from './translations/pl';
import { tr } from './translations/tr';

export type DictionaryStatus = 'complete' | 'partial' | 'fallback-only';

export type TranslationLocaleRegistryEntry = {
  locale: SupportedLocale;
  status: DictionaryStatus;
  dictionary: CompleteTranslationDictionary | PartialTranslationDictionary | null;
  hasLocaleDictionary: boolean;
  usesEnglishFallback: boolean;
};

export const TRANSLATION_LOCALE_REGISTRY: Record<SupportedLocale, TranslationLocaleRegistryEntry> = {
  en: {
    locale: 'en',
    status: 'complete',
    dictionary: en,
    hasLocaleDictionary: true,
    usesEnglishFallback: false,
  },
  de: {
    locale: 'de',
    status: 'complete',
    dictionary: de,
    hasLocaleDictionary: true,
    usesEnglishFallback: false,
  },
  fr: {
    locale: 'fr',
    status: 'partial',
    dictionary: fr,
    hasLocaleDictionary: true,
    usesEnglishFallback: true,
  },
  nl: {
    locale: 'nl',
    status: 'partial',
    dictionary: nl,
    hasLocaleDictionary: true,
    usesEnglishFallback: true,
  },
  es: {
    locale: 'es',
    status: 'partial',
    dictionary: es,
    hasLocaleDictionary: true,
    usesEnglishFallback: true,
  },
  it: {
    locale: 'it',
    status: 'partial',
    dictionary: it,
    hasLocaleDictionary: true,
    usesEnglishFallback: true,
  },
  pl: {
    locale: 'pl',
    status: 'partial',
    dictionary: pl,
    hasLocaleDictionary: true,
    usesEnglishFallback: true,
  },
  cs: {
    locale: 'cs',
    status: 'partial',
    dictionary: cs,
    hasLocaleDictionary: true,
    usesEnglishFallback: true,
  },
  tr: {
    locale: 'tr',
    status: 'fallback-only',
    dictionary: tr,
    hasLocaleDictionary: false,
    usesEnglishFallback: true,
  },
};

export function getTranslationRegistryEntry(locale: SupportedLocale): TranslationLocaleRegistryEntry {
  return TRANSLATION_LOCALE_REGISTRY[locale];
}

export function getLocaleDictionary(
  locale: SupportedLocale,
): CompleteTranslationDictionary | PartialTranslationDictionary | null {
  return TRANSLATION_LOCALE_REGISTRY[locale].dictionary;
}
