import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  LanguageProvider,
  useLanguage,
} from './LanguageContext';
import {
  OFFICIAL_LOCALES_WITHOUT_DICTIONARY,
  OFFICIAL_PRODUCT_LOCALE_CODES,
  SUPPORTED_LOCALES,
} from './locales';
import {
  buildCoverageBaseline,
  findLocalesWithDecreasedCoverage,
} from './translation-coverage';
import baseline from './translation-coverage-baseline.json';
import { TRANSLATION_LOCALE_REGISTRY } from './translation-registry';

const __dirname = dirname(fileURLToPath(import.meta.url));
const translationsDir = join(__dirname, 'translations');
const rentalShimPath = join(__dirname, '../rental/i18n/LanguageContext.tsx');

describe('i18n structural invariants (P0/P1 guardrails)', () => {
  it('keeps the canonical official locale registry stable', () => {
    expect([...OFFICIAL_PRODUCT_LOCALE_CODES]).toEqual([
      'de',
      'en',
      'pl',
      'fr',
      'cs',
      'nl',
      'es',
      'tr',
      'it',
    ]);
    expect(SUPPORTED_LOCALES.map((entry) => entry.code)).toEqual([
      ...OFFICIAL_PRODUCT_LOCALE_CODES,
    ]);
  });

  it('requires a translation dictionary file for every official locale', () => {
    for (const code of OFFICIAL_PRODUCT_LOCALE_CODES) {
      const filePath = join(translationsDir, `${code}.ts`);
      expect(() => readFileSync(filePath, 'utf8')).not.toThrow();
    }
  });

  it('keeps Turkish as fallback-only with an empty typed dictionary file', () => {
    expect(OFFICIAL_LOCALES_WITHOUT_DICTIONARY).toContain('tr');
    expect(TRANSLATION_LOCALE_REGISTRY.tr.status).toBe('fallback-only');
    const turkishSource = readFileSync(join(translationsDir, 'tr.ts'), 'utf8');
    expect(turkishSource).not.toMatch(/\.\.\.en\b/);
    expect(turkishSource).toContain('PartialTranslationDictionary');
  });

  it('forbids ...en spread inheritance in locale dictionary source files', () => {
    const localeFiles = readdirSync(translationsDir).filter(
      (file) => file.endsWith('.ts') && !file.startsWith('legal-documents'),
    );
    for (const file of localeFiles) {
      const source = readFileSync(join(translationsDir, file), 'utf8');
      expect(source, file).not.toMatch(/\.\.\.en\b/);
    }
  });

  it('keeps translation registry aligned with official locales', () => {
    expect(Object.keys(TRANSLATION_LOCALE_REGISTRY).sort()).toEqual(
      [...OFFICIAL_PRODUCT_LOCALE_CODES].sort(),
    );
    for (const locale of OFFICIAL_PRODUCT_LOCALE_CODES) {
      expect(TRANSLATION_LOCALE_REGISTRY[locale]?.locale).toBe(locale);
    }
  });

  it('does not allow explicit owned translation counts to regress below baseline', () => {
    const current = buildCoverageBaseline();
    const decreased = findLocalesWithDecreasedCoverage(baseline, current);
    expect(decreased).toEqual([]);
    expect(current.canonicalKeyCount).toBeGreaterThanOrEqual(
      baseline.baselineCanonicalKeyCount ?? baseline.canonicalKeyCount,
    );
  });

  it('keeps rental LanguageContext as a compatibility re-export shim', () => {
    const shimSource = readFileSync(rentalShimPath, 'utf8');
    expect(shimSource).toContain("from '../../i18n/LanguageContext'");
    expect(shimSource).not.toContain('createContext');
  });

  it('documents that strict translation-key completeness is deferred to P3/P6', () => {
    expect(OFFICIAL_PRODUCT_LOCALE_CODES.length).toBe(9);
  });
});

describe('platform module exports', () => {
  it('exports a single canonical LanguageProvider and hook', () => {
    expect(LanguageProvider).toBeTypeOf('function');
    expect(useLanguage).toBeTypeOf('function');
  });
});
