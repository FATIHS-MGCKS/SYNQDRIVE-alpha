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

const C10_COMMUNICATION_KEYS = [
  'communication.channels.filterGroup',
  'communication.channels.all',
  'communication.channels.whatsapp',
  'communication.channels.voice',
  'communication.channels.sms',
  'communication.primary.channels',
  'communication.primary.automations',
  'communication.channels.title',
  'communication.channels.description',
  'communication.channels.navLabel',
  'communication.channels.nav.overview',
  'communication.channels.email',
  'communication.channels.whatsapp.description',
  'communication.channels.voice.description',
  'communication.channels.sms.description',
  'communication.channels.email.description',
  'communication.channels.providerLabel',
  'communication.channels.configure',
  'communication.channels.accessRestricted',
  'communication.channels.accessDenied.title',
  'communication.channels.accessDenied.description',
  'communication.channels.openConversations',
  'communication.channels.openConversationsVoice',
  'communication.channels.whatsapp.subview.overview',
  'communication.channels.whatsapp.subview.configuration',
  'communication.channels.whatsapp.subview.templates',
  'communication.channels.voice.specializedHint',
  'communication.channels.voice.configureAgent',
  'communication.channels.voice.configureAgentHint',
  'communication.channels.voice.analytics',
  'communication.channels.voice.analyticsHint',
  'communication.channels.voice.telephony',
  'communication.channels.voice.telephonyHint',
  'communication.channels.voice.testAssistant',
  'communication.channels.voice.testAssistantHint',
  'communication.channels.voice.automations',
  'communication.channels.voice.automationsHint',
  'communication.channels.email.transactionalHint',
  'communication.channels.email.openSettings',
  'communication.channels.email.loadError',
  'communication.channels.email.restricted',
  'communication.automations.title',
  'communication.automations.description',
  'communication.automations.open',
  'communication.automations.accessDenied',
] as const satisfies readonly TranslationKey[];

/** Brand/channel names that legitimately stay identical across locales. */
const BRAND_IDENTICAL_KEYS = new Set<TranslationKey>([
  'communication.channels.whatsapp',
  'communication.channels.voice',
  'communication.channels.sms',
]);

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

describe('communication center C10 i18n', () => {
  it('defines every C10 key in English baseline', () => {
    for (const key of C10_COMMUNICATION_KEYS) {
      expect(en[key], `missing en key ${key}`).toBeTruthy();
    }
  });

  for (const locale of Object.keys(LOCALES) as Locale[]) {
    describe(locale, () => {
      for (const key of C10_COMMUNICATION_KEYS) {
        it(`provides translation for ${key}`, () => {
          const value = LOCALES[locale][key];
          expect(value, `missing ${locale} key ${key}`).toBeTruthy();
          if (locale !== 'en' && !BRAND_IDENTICAL_KEYS.has(key)) {
            expect(value).not.toBe(en[key]);
          }
        });
      }
    });
  }

  it('has no duplicate keys in governed locale dictionaries', () => {
    for (const locale of Object.keys(LOCALES) as Locale[]) {
      const dict = LOCALES[locale] as Record<string, string>;
      const keys = Object.keys(dict);
      expect(new Set(keys).size, `duplicate keys in ${locale}`).toBe(keys.length);
    }
  });
});
