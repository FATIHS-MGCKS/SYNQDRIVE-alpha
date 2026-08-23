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

const C92_VOICE_KEYS = [
  'communication.voice.callCardLabel',
  'communication.voice.showTranscript',
  'communication.voice.hideTranscript',
  'communication.voice.transcriptUnavailable',
  'communication.voice.createTask',
  'communication.voice.aiActivity',
  'communication.voice.direction.inbound',
  'communication.voice.direction.outbound',
  'communication.voice.filters.directionAll',
  'communication.voice.filters.outcomeAll',
  'communication.voice.filters.escalatedOnly',
  'communication.voice.filters.hasTranscript',
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

describe('communication center C9.2 voice i18n', () => {
  it('defines every C9.2 voice key in English baseline', () => {
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
});
