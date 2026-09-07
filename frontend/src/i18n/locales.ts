/**
 * Canonical SynqDrive product locale contract.
 *
 * Platform locale state covers all official product locales. Translation
 * dictionaries may lag behind for individual locales (see
 * OFFICIAL_LOCALES_WITHOUT_DICTIONARY).
 */

export const OFFICIAL_PRODUCT_LOCALE_CODES = [
  'de',
  'en',
  'pl',
  'fr',
  'cs',
  'nl',
  'es',
  'tr',
  'it',
] as const;

export type SupportedLocale = (typeof OFFICIAL_PRODUCT_LOCALE_CODES)[number];

export type LocaleMetadata = {
  code: SupportedLocale;
  nativeName: string;
  bcp47: string;
};

export const SUPPORTED_LOCALES: readonly LocaleMetadata[] = [
  { code: 'de', nativeName: 'Deutsch', bcp47: 'de-DE' },
  { code: 'en', nativeName: 'English', bcp47: 'en-GB' },
  { code: 'pl', nativeName: 'Polski', bcp47: 'pl-PL' },
  { code: 'fr', nativeName: 'Français', bcp47: 'fr-FR' },
  { code: 'cs', nativeName: 'Čeština', bcp47: 'cs-CZ' },
  { code: 'nl', nativeName: 'Nederlands', bcp47: 'nl-NL' },
  { code: 'es', nativeName: 'Español', bcp47: 'es-ES' },
  { code: 'tr', nativeName: 'Türkçe', bcp47: 'tr-TR' },
  { code: 'it', nativeName: 'Italiano', bcp47: 'it-IT' },
] as const;

export const DEFAULT_PRODUCT_LOCALE: SupportedLocale = 'en';
export const FALLBACK_PRODUCT_LOCALE: SupportedLocale = 'en';

/** Locales without meaningful owned product translations (explicit English fallback at lookup time). */
export const OFFICIAL_LOCALES_WITHOUT_DICTIONARY: readonly SupportedLocale[] = ['tr'];

/**
 * @deprecated Use OFFICIAL_PRODUCT_LOCALE_CODES. Retained temporarily for P0 structural checks.
 */
export const RUNTIME_TRANSLATION_LOCALE_CODES = [
  'en',
  'de',
  'fr',
  'nl',
  'es',
  'it',
  'pl',
  'cs',
] as const;

/** @deprecated Use SupportedLocale */
export type RuntimeTranslationLocale = (typeof RUNTIME_TRANSLATION_LOCALE_CODES)[number];

/** @deprecated Use DEFAULT_PRODUCT_LOCALE */
export const DEFAULT_RUNTIME_TRANSLATION_LOCALE: RuntimeTranslationLocale = 'en';

export const LOCALE_STORAGE_KEY = 'synqdrive.locale';

const supportedLocaleSet = new Set<string>(OFFICIAL_PRODUCT_LOCALE_CODES);

const BROWSER_LOCALE_PREFIX_MAP: ReadonlyArray<[prefix: string, locale: SupportedLocale]> = [
  ['de', 'de'],
  ['en', 'en'],
  ['pl', 'pl'],
  ['fr', 'fr'],
  ['cs', 'cs'],
  ['nl', 'nl'],
  ['es', 'es'],
  ['tr', 'tr'],
  ['it', 'it'],
];

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return Boolean(value && supportedLocaleSet.has(value));
}

/** @deprecated Use isSupportedLocale */
export function isRuntimeTranslationLocale(
  value: string | null | undefined,
): value is RuntimeTranslationLocale {
  return Boolean(
    value &&
      (RUNTIME_TRANSLATION_LOCALE_CODES as readonly string[]).includes(value),
  );
}

export function getLocaleMetadata(code: SupportedLocale): LocaleMetadata {
  const metadata = SUPPORTED_LOCALES.find((entry) => entry.code === code);
  if (!metadata) {
    throw new Error(`Unknown supported locale: ${code}`);
  }
  return metadata;
}

export function getFormattingLocale(code: SupportedLocale): string {
  return getLocaleMetadata(code).bcp47;
}

function matchBrowserTag(browserLocale: string): SupportedLocale | null {
  const normalized = browserLocale.trim().toLowerCase();
  if (!normalized) return null;

  const primary = normalized.split(/[-_]/)[0] ?? normalized;
  for (const [prefix, locale] of BROWSER_LOCALE_PREFIX_MAP) {
    if (primary === prefix || normalized.startsWith(`${prefix}-`)) {
      return locale;
    }
  }
  return null;
}

/**
 * Resolve a single browser / BCP-47 tag to an official SynqDrive product locale.
 * Unsupported values fall back to FALLBACK_PRODUCT_LOCALE (`en`).
 */
export function resolveBrowserLocale(browserLocale: string | null | undefined): SupportedLocale {
  return matchBrowserTag(browserLocale ?? '') ?? FALLBACK_PRODUCT_LOCALE;
}

/**
 * Resolve the first supported locale from the browser preference list.
 * Example: ["sv-SE", "pl-PL", "en-US"] -> "pl".
 */
export function resolveBrowserLocaleFromPreferenceList(
  browserLocales: readonly string[] | null | undefined,
): SupportedLocale {
  if (!browserLocales?.length) {
    return FALLBACK_PRODUCT_LOCALE;
  }

  for (const tag of browserLocales) {
    const match = matchBrowserTag(tag);
    if (match) return match;
  }

  return FALLBACK_PRODUCT_LOCALE;
}

/** @deprecated Use resolveBrowserLocaleFromPreferenceList / resolveInitialPlatformLocale */
export function resolveRuntimeTranslationLocale(
  browserLocale: string | null | undefined,
): RuntimeTranslationLocale {
  const resolved = resolveBrowserLocale(browserLocale);
  if (isRuntimeTranslationLocale(resolved)) {
    return resolved;
  }
  return DEFAULT_RUNTIME_TRANSLATION_LOCALE;
}

export function readPersistedLocale(): SupportedLocale | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isSupportedLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writePersistedLocale(locale: SupportedLocale): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore storage failures
  }
}

/**
 * Platform locale precedence:
 * 1. valid persisted locale
 * 2. first supported browser preference
 * 3. canonical default (`en`)
 */
export function resolveInitialPlatformLocale(
  browserLocales: readonly string[] | null | undefined = typeof navigator === 'undefined'
    ? []
    : navigator.languages,
): SupportedLocale {
  const persisted = readPersistedLocale();
  if (persisted) return persisted;
  return resolveBrowserLocaleFromPreferenceList(browserLocales);
}
