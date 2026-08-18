import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ownsTranslationKey } from './dictionary-types';
import { isLegallyReviewedLegalLocale, LEGAL_DOCUMENT_LOCALIZATION } from './legal-documents-registry';
import { OFFICIAL_PRODUCT_LOCALE_CODES } from './locales';
import { translateKey } from './LanguageContext';
import {
  buildAllLocaleCoverageReports,
  buildCoverageBaseline,
  CANONICAL_KEY_COUNT,
  formatCoverageReportLines,
} from './translation-coverage';
import baseline from './translation-coverage-baseline.json';
import {
  getTranslationRegistryEntry,
  TRANSLATION_LOCALE_REGISTRY,
} from './translation-registry';
import { de } from './translations/de';
import { en } from './translations/en';
import { fr } from './translations/fr';
import { it as itDictionary } from './translations/it';
import { tr } from './translations/tr';

const __dirname = dirname(fileURLToPath(import.meta.url));
const translationsDir = join(__dirname, 'translations');

describe('translation registry', () => {
  it('registers all 9 official locales', () => {
    expect(Object.keys(TRANSLATION_LOCALE_REGISTRY)).toHaveLength(9);
    for (const locale of OFFICIAL_PRODUCT_LOCALE_CODES) {
      expect(TRANSLATION_LOCALE_REGISTRY[locale]?.locale).toBe(locale);
    }
  });

  it('marks English and German as complete dictionaries', () => {
    expect(getTranslationRegistryEntry('en').status).toBe('complete');
    expect(getTranslationRegistryEntry('de').status).toBe('complete');
    expect(Object.keys(en)).toHaveLength(CANONICAL_KEY_COUNT);
    expect(Object.keys(de)).toHaveLength(CANONICAL_KEY_COUNT);
  });

  it('marks partial locales as partial with English fallback enabled', () => {
    for (const locale of ['fr', 'nl', 'es', 'it', 'pl', 'cs'] as const) {
      const entry = getTranslationRegistryEntry(locale);
      expect(entry.status).toBe('partial');
      expect(entry.usesEnglishFallback).toBe(true);
    }
  });

  it('marks Turkish as fallback-only without owned product keys', () => {
    const entry = getTranslationRegistryEntry('tr');
    expect(entry.status).toBe('fallback-only');
    expect(Object.keys(tr)).toHaveLength(0);
    expect(entry.usesEnglishFallback).toBe(true);
  });
});

describe('dictionary ownership and forbidden inheritance', () => {
  it('does not allow ...en spread in any locale dictionary source file', () => {
    const localeFiles = readdirSync(translationsDir).filter(
      (file) => file.endsWith('.ts') && !file.startsWith('legal-documents'),
    );
    for (const file of localeFiles) {
      const source = readFileSync(join(translationsDir, file), 'utf8');
      expect(source, file).not.toMatch(/\.\.\.en\b/);
    }
  });

  it('resolves owned Italian translations from locale dictionary', () => {
    expect(ownsTranslationKey(itDictionary, 'common.save')).toBe(true);
    const result = translateKey('it', 'common.save');
    expect(result.source).toBe('locale');
    expect(result.text).toBe('Salva');
  });

  it('uses explicit English fallback for Turkish', () => {
    const result = translateKey('tr', 'common.save');
    expect(result.source).toBe('fallback-en');
    expect(result.text).toBe(en['common.save']);
  });

  it('uses explicit English fallback for missing French keys', () => {
    const result = translateKey('fr', 'evaluations.recommendations.actions.viewDriverInfluence');
    expect(result.source).toBe('fallback-en');
    expect(ownsTranslationKey(fr, 'evaluations.recommendations.actions.viewDriverInfluence')).toBe(false);
  });
});

describe('coverage reporting', () => {
  it('matches the committed baseline owned-count snapshot', () => {
    const current = buildCoverageBaseline();
    expect(current.canonicalKeyCount).toBeGreaterThanOrEqual(
      baseline.baselineCanonicalKeyCount ?? baseline.canonicalKeyCount,
    );
    for (const locale of OFFICIAL_PRODUCT_LOCALE_CODES) {
      expect(current.locales[locale].ownedCount).toBeGreaterThanOrEqual(
        baseline.locales[locale].ownedCount,
      );
      expect(current.locales[locale].status).toBe(baseline.locales[locale].status);
    }
  });

  it('prints structural and coverage summary for i18n:check', () => {
    const lines = formatCoverageReportLines(buildAllLocaleCoverageReports());
    expect(lines[0]).toBe('SynqDrive i18n');
    expect(lines[1]).toContain(String(CANONICAL_KEY_COUNT));
    for (const locale of OFFICIAL_PRODUCT_LOCALE_CODES) {
      expect(lines.some((line) => line.startsWith(`${locale} `))).toBe(true);
    }
    // eslint-disable-next-line no-console
    console.log('\n' + lines.join('\n'));
  });
});

describe('legal document localization metadata', () => {
  it('distinguishes legally reviewed DE/EN from fallback locales', () => {
    expect(isLegallyReviewedLegalLocale('en')).toBe(true);
    expect(isLegallyReviewedLegalLocale('de')).toBe(true);
    expect(isLegallyReviewedLegalLocale('fr')).toBe(false);
    expect(LEGAL_DOCUMENT_LOCALIZATION.pl.status).toBe('runtime-fallback');
  });
});
