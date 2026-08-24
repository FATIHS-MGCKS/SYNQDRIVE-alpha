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

const C13_1_RETENTION_KEYS = [
  'communication.timeline.messagePurged',
] as const satisfies readonly TranslationKey[];

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

describe('communication center C13.1 retention i18n', () => {
  it('defines messagePurged in English baseline', () => {
    expect(en['communication.timeline.messagePurged']).toBeTruthy();
  });

  for (const locale of Object.keys(LOCALES) as Locale[]) {
    describe(locale, () => {
      for (const key of C13_1_RETENTION_KEYS) {
        it(`provides native translation for ${key}`, () => {
          const value = LOCALES[locale][key];
          expect(value, `missing ${locale} key ${key}`).toBeTruthy();
          if (locale !== 'en') {
            expect(value).not.toBe(en[key]);
          }
        });
      }
    });
  }
});
