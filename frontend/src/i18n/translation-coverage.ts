import { countOwnedTranslationKeys } from './dictionary-types';
import { OFFICIAL_PRODUCT_LOCALE_CODES, type SupportedLocale } from './locales';
import {
  getTranslationRegistryEntry,
  type DictionaryStatus,
  TRANSLATION_LOCALE_REGISTRY,
} from './translation-registry';
import { en, type TranslationKey } from './translations/en';

export const CANONICAL_TRANSLATION_KEYS = Object.keys(en) as TranslationKey[];
export const CANONICAL_KEY_COUNT = CANONICAL_TRANSLATION_KEYS.length;

export type LocaleCoverageReport = {
  locale: SupportedLocale;
  ownedCount: number;
  missingCount: number;
  coveragePercent: number;
  status: DictionaryStatus;
  usesFallback: boolean;
};

export function buildLocaleCoverageReport(locale: SupportedLocale): LocaleCoverageReport {
  const entry = getTranslationRegistryEntry(locale);
  const ownedCount = entry.dictionary ? countOwnedTranslationKeys(entry.dictionary) : 0;
  const missingCount = Math.max(CANONICAL_KEY_COUNT - ownedCount, 0);
  const coveragePercent =
    CANONICAL_KEY_COUNT === 0 ? 0 : Math.round((ownedCount / CANONICAL_KEY_COUNT) * 10000) / 100;

  return {
    locale,
    ownedCount,
    missingCount,
    coveragePercent,
    status: entry.status,
    usesFallback: entry.usesEnglishFallback,
  };
}

export function buildAllLocaleCoverageReports(): LocaleCoverageReport[] {
  return OFFICIAL_PRODUCT_LOCALE_CODES.map((locale) => buildLocaleCoverageReport(locale));
}

export function formatCoverageStatus(status: DictionaryStatus): string {
  switch (status) {
    case 'complete':
      return 'COMPLETE';
    case 'partial':
      return 'PARTIAL';
    case 'fallback-only':
      return 'FALLBACK ONLY';
    default:
      return status;
  }
}

export function formatCoverageReportLines(reports: LocaleCoverageReport[]): string[] {
  const lines = [`SynqDrive i18n`, `Canonical keys: ${CANONICAL_KEY_COUNT}`, ''];
  for (const report of reports) {
    const label = formatCoverageStatus(report.status);
    lines.push(
      `${report.locale.padEnd(3)} ${String(report.ownedCount).padStart(5)}/${CANONICAL_KEY_COUNT}  ${String(report.coveragePercent).padStart(6)}%  ${label}`,
    );
  }
  return lines;
}

export type CoverageBaseline = {
  version: 2;
  canonicalKeyCount: number;
  /** Canonical key count when owned-count floors were captured (P1.2/P2 baseline). */
  baselineCanonicalKeyCount: number;
  locales: Record<
    SupportedLocale,
    {
      ownedCount: number;
      status: DictionaryStatus;
    }
  >;
};

export function buildCoverageBaseline(): CoverageBaseline {
  const locales = {} as CoverageBaseline['locales'];
  for (const locale of OFFICIAL_PRODUCT_LOCALE_CODES) {
    const report = buildLocaleCoverageReport(locale);
    locales[locale] = {
      ownedCount: report.ownedCount,
      status: report.status,
    };
  }
  return {
    version: 2,
    canonicalKeyCount: CANONICAL_KEY_COUNT,
    baselineCanonicalKeyCount: CANONICAL_KEY_COUNT,
    locales,
  };
}

export function findLocalesWithDecreasedCoverage(
  baseline: CoverageBaseline,
  current: CoverageBaseline,
): SupportedLocale[] {
  const decreased: SupportedLocale[] = [];
  for (const locale of OFFICIAL_PRODUCT_LOCALE_CODES) {
    const previous = baseline.locales[locale]?.ownedCount ?? 0;
    const next = current.locales[locale]?.ownedCount ?? 0;
    if (next < previous) {
      decreased.push(locale);
    }
  }
  return decreased;
}

export function countNewCanonicalKeysSinceBaseline(baseline: CoverageBaseline): number {
  const floor = baseline.baselineCanonicalKeyCount ?? baseline.canonicalKeyCount;
  return Math.max(CANONICAL_KEY_COUNT - floor, 0);
}

export function findNewCanonicalKeysMissingFromLocale(
  locale: SupportedLocale,
  previousCanonicalKeyCount: number,
): number {
  if (CANONICAL_KEY_COUNT <= previousCanonicalKeyCount) {
    return 0;
  }
  const addedKeys = CANONICAL_KEY_COUNT - previousCanonicalKeyCount;
  const report = buildLocaleCoverageReport(locale);
  return report.ownedCount === 0 ? addedKeys : addedKeys;
}

export { TRANSLATION_LOCALE_REGISTRY };
