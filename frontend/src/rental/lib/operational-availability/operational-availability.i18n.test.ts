import { describe, expect, it } from 'vitest';
import { cs } from '../../i18n/translations/cs';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import { es } from '../../i18n/translations/es';
import { fr } from '../../i18n/translations/fr';
import { it as itLocale } from '../../i18n/translations/it';
import { nl } from '../../i18n/translations/nl';
import { pl } from '../../i18n/translations/pl';
import type { TranslationKey } from '../../i18n/translations/en';

const OPERATIONAL_AVAILABILITY_KEYS: TranslationKey[] = [
  'fleet.operationalAvailability.available',
  'fleet.operationalAvailability.needsVerification',
  'fleet.operationalAvailability.unknown',
  'fleet.operationalAvailability.unavailable',
  'fleet.operationalAvailability.tooltip.needsVerification',
  'fleet.operationalAvailability.tooltip.unknown',
  'fleet.operationalAvailability.tooltip.unavailable',
  'fleet.operationalAvailability.reason.deviceCheckRequired',
  'fleet.operationalAvailability.reason.telemetryOffline',
  'fleet.operationalAvailability.reason.businessWorkflowBlocked',
  'fleet.operationalAvailability.reason.healthRentalBlocked',
];

const LOCALES = [
  { name: 'en', dict: en },
  { name: 'de', dict: de },
  { name: 'fr', dict: fr },
  { name: 'nl', dict: nl },
  { name: 'es', dict: es },
  { name: 'it', dict: itLocale },
  { name: 'pl', dict: pl },
  { name: 'cs', dict: cs },
] as const;

describe('fleet operational availability i18n', () => {
  it('defines every key in all governed locales', () => {
    for (const { name, dict } of LOCALES) {
      for (const key of OPERATIONAL_AVAILABILITY_KEYS) {
        expect(dict[key], `missing ${name} key ${key}`).toBeTruthy();
      }
    }
  });

  it('uses canonical DE/EN operator labels', () => {
    expect(de['fleet.operationalAvailability.available']).toBe('Verfügbar');
    expect(de['fleet.operationalAvailability.needsVerification']).toBe('Prüfung erforderlich');
    expect(de['fleet.operationalAvailability.unknown']).toBe('Status unbekannt');
    expect(de['fleet.operationalAvailability.unavailable']).toBe('Nicht verfügbar');
    expect(en['fleet.operationalAvailability.available']).toBe('Available');
    expect(en['fleet.operationalAvailability.needsVerification']).toBe('Check required');
    expect(en['fleet.operationalAvailability.unknown']).toBe('Status unknown');
    expect(en['fleet.operationalAvailability.unavailable']).toBe('Unavailable');
  });
});
