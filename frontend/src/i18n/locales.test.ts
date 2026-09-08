import { describe, expect, it } from 'vitest';
import {
  FALLBACK_PRODUCT_LOCALE,
  OFFICIAL_LOCALES_WITHOUT_DICTIONARY,
  OFFICIAL_PRODUCT_LOCALE_CODES,
  SUPPORTED_LOCALES,
  getFormattingLocale,
  resolveBrowserLocale,
  resolveBrowserLocaleFromPreferenceList,
} from './locales';

const EXPECTED_OFFICIAL_CODES = ['de', 'en', 'pl', 'fr', 'cs', 'nl', 'es', 'tr', 'it'] as const;

describe('canonical product locales', () => {
  it('defines exactly 9 official product locales', () => {
    expect(OFFICIAL_PRODUCT_LOCALE_CODES).toHaveLength(9);
    expect(SUPPORTED_LOCALES).toHaveLength(9);
  });

  it('includes all expected locale codes without duplicates', () => {
    expect([...OFFICIAL_PRODUCT_LOCALE_CODES]).toEqual([...EXPECTED_OFFICIAL_CODES]);
    expect(new Set(OFFICIAL_PRODUCT_LOCALE_CODES).size).toBe(9);
    expect(new Set(SUPPORTED_LOCALES.map((entry) => entry.code)).size).toBe(9);
  });

  it('assigns a BCP-47 formatting locale to every supported locale', () => {
    for (const entry of SUPPORTED_LOCALES) {
      expect(entry.bcp47).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
      expect(entry.nativeName.trim().length).toBeGreaterThan(0);
    }
  });

  it('maps all nine official product locales to canonical BCP-47 formatting tags', () => {
    const expected: Record<(typeof EXPECTED_OFFICIAL_CODES)[number], string> = {
      de: 'de-DE',
      en: 'en-GB',
      pl: 'pl-PL',
      fr: 'fr-FR',
      cs: 'cs-CZ',
      nl: 'nl-NL',
      es: 'es-ES',
      tr: 'tr-TR',
      it: 'it-IT',
    };

    for (const code of EXPECTED_OFFICIAL_CODES) {
      expect(getFormattingLocale(code)).toBe(expected[code]);
    }
  });

  it('keeps Italian and Turkish in the official target set', () => {
    expect(OFFICIAL_PRODUCT_LOCALE_CODES).toContain('it');
    expect(OFFICIAL_PRODUCT_LOCALE_CODES).toContain('tr');
  });

  it('marks Turkish as dictionary-less with explicit runtime fallback', () => {
    expect(OFFICIAL_LOCALES_WITHOUT_DICTIONARY).toContain('tr');
    expect(OFFICIAL_LOCALES_WITHOUT_DICTIONARY).not.toContain('it');
  });
});

describe('resolveBrowserLocale', () => {
  const cases: Array<[input: string, expected: (typeof EXPECTED_OFFICIAL_CODES)[number]]> = [
    ['de-DE', 'de'],
    ['de-AT', 'de'],
    ['en-GB', 'en'],
    ['en-US', 'en'],
    ['pl-PL', 'pl'],
    ['fr-FR', 'fr'],
    ['cs-CZ', 'cs'],
    ['nl-NL', 'nl'],
    ['es-ES', 'es'],
    ['tr-TR', 'tr'],
    ['it-IT', 'it'],
  ];

  it.each(cases)('maps %s to %s', (input, expected) => {
    expect(resolveBrowserLocale(input)).toBe(expected);
  });

  it('falls back to English for unsupported browser locales', () => {
    expect(resolveBrowserLocale('ja-JP')).toBe(FALLBACK_PRODUCT_LOCALE);
    expect(resolveBrowserLocale('')).toBe(FALLBACK_PRODUCT_LOCALE);
    expect(resolveBrowserLocale(null)).toBe(FALLBACK_PRODUCT_LOCALE);
  });
});

describe('resolveBrowserLocaleFromPreferenceList', () => {
  it('selects the first supported locale from browser preference order', () => {
    expect(resolveBrowserLocaleFromPreferenceList(['sv-SE', 'pl-PL', 'en-US'])).toBe('pl');
  });

  it('resolves Italian from preference list', () => {
    expect(resolveBrowserLocaleFromPreferenceList(['it-IT', 'en-US'])).toBe('it');
  });

  it('resolves Turkish from preference list', () => {
    expect(resolveBrowserLocaleFromPreferenceList(['tr-TR', 'en-US'])).toBe('tr');
  });

  it('falls back to English when no supported locale is present', () => {
    expect(resolveBrowserLocaleFromPreferenceList(['sv-SE', 'ja-JP'])).toBe('en');
  });
});
