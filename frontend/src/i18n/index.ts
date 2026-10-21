export {
  LanguageProvider,
  useLanguage,
  translateKey,
  syncDocumentLanguage,
  usesLocaleDictionary,
  LOCALE_STORAGE_KEY,
  type Locale,
  type SupportedLocale,
  type TranslationKey,
  type TranslationSource,
  type TranslateResult,
  type LocaleMetadata,
} from './LanguageContext';

export {
  DEFAULT_PRODUCT_LOCALE,
  FALLBACK_PRODUCT_LOCALE,
  LOCALE_STORAGE_KEY as PLATFORM_LOCALE_STORAGE_KEY,
  OFFICIAL_LOCALES_WITHOUT_DICTIONARY,
  OFFICIAL_PRODUCT_LOCALE_CODES,
  SUPPORTED_LOCALES,
  getFormattingLocale,
  getLocaleMetadata,
  isSupportedLocale,
  readPersistedLocale,
  resolveBrowserLocale,
  resolveBrowserLocaleFromPreferenceList,
  resolveInitialPlatformLocale,
  writePersistedLocale,
  type SupportedLocale as PlatformSupportedLocale,
  type LocaleMetadata as PlatformLocaleMetadata,
} from './locales';

export { en, type TranslationKey as PlatformTranslationKey } from './translations/en';
