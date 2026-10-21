import { describe, expect, it } from 'vitest';

import { OFFICIAL_PRODUCT_LOCALE_CODES } from './locales';
import { getTranslationRegistryEntry } from './translation-registry';
import {
  buildAllLocaleCoverageReports,
  buildCoverageBaseline,
  CANONICAL_KEY_COUNT,
  countNewCanonicalKeysSinceBaseline,
  findLocalesWithDecreasedCoverage,
  type CoverageBaseline,
} from './translation-coverage';
import baseline from './translation-coverage-baseline.json';
import { en } from './translations/en';

describe('translation coverage contract', () => {
  it('CANONICAL_KEY_COUNT matches the English canonical dictionary', () => {
    expect(CANONICAL_KEY_COUNT).toBe(Object.keys(en).length);
  });

  it('buildAllLocaleCoverageReports returns exactly nine official locales', () => {
    const reports = buildAllLocaleCoverageReports();
    expect(reports).toHaveLength(9);
    expect(reports.map((report) => report.locale)).toEqual([...OFFICIAL_PRODUCT_LOCALE_CODES]);
  });

  it('derived coverage matches the committed baseline', () => {
    const current = buildCoverageBaseline();
    expect(current.canonicalKeyCount).toBe(baseline.canonicalKeyCount);

    const expected = {
      en: { ownedCount: 10431, status: 'complete' },
      de: { ownedCount: 10431, status: 'complete' },
      fr: { ownedCount: 1038, status: 'partial' },
      pl: { ownedCount: 745, status: 'partial' },
      cs: { ownedCount: 727, status: 'partial' },
      nl: { ownedCount: 745, status: 'partial' },
      es: { ownedCount: 745, status: 'partial' },
      it: { ownedCount: 745, status: 'partial' },
      tr: { ownedCount: 0, status: 'fallback-only' },
    } as const;

    for (const [locale, values] of Object.entries(expected)) {
      expect(current.locales[locale as keyof typeof expected]).toEqual(values);
      expect(baseline.locales[locale as keyof typeof expected]).toEqual(values);
    }
  });

  it('Turkish fallback does not count as Turkish-owned translations', () => {
    const turkish = getTranslationRegistryEntry('tr');
    const report = buildAllLocaleCoverageReports().find((entry) => entry.locale === 'tr');

    expect(turkish.usesEnglishFallback).toBe(true);
    expect(turkish.dictionary).toEqual({});
    expect(report?.ownedCount).toBe(0);
    expect(report?.status).toBe('fallback-only');
  });

  it('findLocalesWithDecreasedCoverage detects a synthetic locale decrease', () => {
    const current = buildCoverageBaseline();
    const decreasedBaseline: CoverageBaseline = {
      ...current,
      locales: {
        ...current.locales,
        pl: {
          ownedCount: current.locales.pl.ownedCount + 10,
          status: current.locales.pl.status,
        },
      },
    };

    expect(findLocalesWithDecreasedCoverage(decreasedBaseline, current)).toEqual(['pl']);
    expect(findLocalesWithDecreasedCoverage(current, current)).toEqual([]);
  });

  it('countNewCanonicalKeysSinceBaseline reports only canonical key-count growth', () => {
    const current = buildCoverageBaseline();

    expect(countNewCanonicalKeysSinceBaseline(baseline as CoverageBaseline)).toBe(0);

    const olderBaseline: CoverageBaseline = {
      ...baseline,
      baselineCanonicalKeyCount: baseline.canonicalKeyCount - 7,
    };
    expect(countNewCanonicalKeysSinceBaseline(olderBaseline)).toBe(7);

    const inflatedBaseline: CoverageBaseline = {
      ...baseline,
      baselineCanonicalKeyCount: baseline.canonicalKeyCount + 25,
    };
    expect(countNewCanonicalKeysSinceBaseline(inflatedBaseline)).toBe(0);
  });

  it('does not expose a misleading per-locale new-key count API', async () => {
    const coverage = await import('./translation-coverage');

    expect('findNewCanonicalKeysMissingFromLocale' in coverage).toBe(false);
    expect(countNewCanonicalKeysSinceBaseline(baseline as CoverageBaseline)).toBe(0);
    expect(countNewCanonicalKeysSinceBaseline({
      ...baseline,
      baselineCanonicalKeyCount: baseline.canonicalKeyCount - 3,
    } as CoverageBaseline)).toBe(3);
  });
});
