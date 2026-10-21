import type { TranslationKey } from './translations/en';

/** Canonical complete dictionary — every TranslationKey must be present. */
export type CompleteTranslationDictionary = Record<TranslationKey, string>;

/** Locale-owned translations only; missing keys resolve via runtime English fallback. */
export type PartialTranslationDictionary = Partial<Record<TranslationKey, string>>;

export function countOwnedTranslationKeys(
  dictionary: PartialTranslationDictionary | CompleteTranslationDictionary,
): number {
  return Object.keys(dictionary).length;
}

export function ownsTranslationKey(
  dictionary: PartialTranslationDictionary | CompleteTranslationDictionary | null | undefined,
  key: TranslationKey,
): boolean {
  return Boolean(dictionary && Object.prototype.hasOwnProperty.call(dictionary, key));
}
