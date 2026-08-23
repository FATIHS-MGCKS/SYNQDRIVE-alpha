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

const C91_COMMUNICATION_KEYS = [
  'communication.filters.intentLabel',
  'communication.filters.intentAll',
  'communication.filters.intentAiSuggested',
  'communication.filters.intentUnknownCustomer',
  'communication.filters.intentBooking',
  'communication.filters.intentDocuments',
  'communication.filters.intentPayment',
  'communication.filters.intentDamage',
  'communication.aiSuggestion.label',
  'communication.aiSuggestion.generate',
  'communication.aiSuggestion.error',
  'communication.quickActions.label',
  'communication.quickActions.confirm.cancel',
  'communication.quickActions.confirm.proceed',
  'communication.quickActions.actions.sendPickupInstructions',
  'communication.quickActions.actions.closeConversation',
  'communication.quickActions.disabled.missingTaskPermission',
  'communication.template.required',
  'communication.template.choose',
  'communication.template.selectPlaceholder',
  'communication.template.variable',
  'communication.template.send',
  'communication.template.loading',
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

describe('communication center C9.1 i18n', () => {
  it('defines every C9.1 key in English baseline', () => {
    for (const key of C91_COMMUNICATION_KEYS) {
      expect(en[key]).toBeTruthy();
    }
  });

  for (const [locale, table] of Object.entries(LOCALES) as Array<[Locale, Record<TranslationKey, string>]>) {
    it(`defines every C9.1 key in ${locale}`, () => {
      for (const key of C91_COMMUNICATION_KEYS) {
        expect(table[key]).toBeTruthy();
      }
    });
  }
});
