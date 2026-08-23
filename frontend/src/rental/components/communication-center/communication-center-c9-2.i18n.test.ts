import { describe, expect, it } from 'vitest';
import type { TranslationKey } from '../../i18n/translations/en';
import { en } from '../../i18n/translations/en';
import { de } from '../../i18n/translations/de';
import { fr } from '../../i18n/translations/fr';
import { nl } from '../../i18n/translations/nl';
import { es } from '../../i18n/translations/es';
import { it as itLocale } from '../../i18n/translations/it';
import { pl } from '../../i18n/translations/pl';
import { cs } from '../../i18n/translations/cs';
import type { Locale } from '../../i18n/LanguageContext';

const C92_VOICE_KEYS = Object.keys(en).filter((key) =>
  key.startsWith('communication.voice.'),
) as TranslationKey[];

const LOCALES: Record<Locale, Record<TranslationKey, string>> = {
  en,
  de,
  fr,
  nl,
  es,
  it: itLocale,
  pl,
  cs,
};

const NON_ENGLISH_PLACEHOLDER_LOCALES: Locale[] = ['fr', 'nl', 'es', 'it', 'pl', 'cs'];

function englishPlaceholderMatches(locale: Locale, key: TranslationKey): boolean {
  return LOCALES[locale][key] === en[key];
}

describe('communication center C9.2 voice i18n', () => {
  it('defines every C9.2 voice key in English baseline', () => {
    expect(C92_VOICE_KEYS.length).toBeGreaterThan(30);
    for (const key of C92_VOICE_KEYS) {
      expect(en[key]).toBeTruthy();
    }
  });

  for (const [locale, table] of Object.entries(LOCALES) as Array<[Locale, Record<TranslationKey, string>]>) {
    it(`defines every C9.2 voice key in ${locale}`, () => {
      for (const key of C92_VOICE_KEYS) {
        expect(table[key]).toBeTruthy();
      }
    });
  }

  for (const locale of NON_ENGLISH_PLACEHOLDER_LOCALES) {
    it(`does not keep wholesale English placeholder blocks for ${locale}`, () => {
      const englishMatches = C92_VOICE_KEYS.filter((key) => englishPlaceholderMatches(locale, key));
      const matchRatio = englishMatches.length / C92_VOICE_KEYS.length;
      expect(matchRatio).toBeLessThan(0.5);
      expect(englishMatches).not.toEqual(C92_VOICE_KEYS);
    });
  }
});
