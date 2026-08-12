/**
 * E6C.1 shared, display-only canonical coverage presenter. Renders EVERY field of the
 * canonical `EvaluationsDataCoverage` verbatim — no business derivation, no replacement
 * ratio, and null is NEVER coerced to zero (null → the canonical unavailable
 * placeholder). Used by both the Data Quality panel and the Driver Influence surface so
 * coverage formatting is not duplicated.
 */
import { useLanguage } from '../../i18n/LanguageContext';
import type { EvaluationsDataCoverage } from '../../lib/evaluations/evaluations-canonical.types';

export function EvaluationsCoverageDetails({
  coverage,
  testId = 'evaluations-coverage',
}: {
  coverage: EvaluationsDataCoverage | null;
  testId?: string;
}) {
  const { t, locale } = useLanguage();
  const unavailable = t('evaluations.value.unavailable');

  if (coverage === null) {
    return (
      <div data-testid={testId}>
        <p className="text-[11px] font-medium text-[var(--muted-foreground)]">{t('evaluations.quality.coverage')}</p>
        <span className="text-[var(--muted-foreground)]">{t('evaluations.quality.unavailableForScope')}</span>
      </div>
    );
  }

  const count = (n: number | null) => (n === null ? unavailable : String(n));
  const ratio =
    coverage.ratio === null
      ? unavailable
      : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(coverage.ratio);

  return (
    <div data-testid={testId} className="flex flex-col gap-0.5">
      <p className="text-[11px] font-medium text-[var(--muted-foreground)]">{t('evaluations.quality.coverage')}</p>
      <span className="text-[11px] tabular-nums" data-testid={`${testId}-ratio`}>
        {t('evaluations.coverage.ratio')}: {ratio}
      </span>
      <span className="text-[11px] tabular-nums" data-testid={`${testId}-available`}>
        {t('evaluations.coverage.available')}: {count(coverage.availableRecords)}
      </span>
      <span className="text-[11px] tabular-nums" data-testid={`${testId}-expected`}>
        {t('evaluations.coverage.expected')}: {count(coverage.expectedRecords)}
      </span>
      <span className="text-[11px] tabular-nums" data-testid={`${testId}-excluded`}>
        {t('evaluations.coverage.excluded')}: {count(coverage.excludedRecords)}
      </span>
      <div data-testid={`${testId}-missing-sources`}>
        <span className="text-[11px] text-[var(--muted-foreground)]">{t('evaluations.coverage.missingSources')}:</span>{' '}
        {coverage.missingSources.length === 0 ? (
          <span className="text-[11px] text-[var(--muted-foreground)]">{t('evaluations.coverage.noMissingSources')}</span>
        ) : (
          // Server order preserved; entries are contract data, shown verbatim.
          <span className="text-[11px] break-words">{coverage.missingSources.join(', ')}</span>
        )}
      </div>
    </div>
  );
}
