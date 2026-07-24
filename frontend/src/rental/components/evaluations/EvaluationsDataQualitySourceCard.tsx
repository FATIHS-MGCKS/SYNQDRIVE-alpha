import { ExternalLink } from 'lucide-react';
import type { EvaluationsDataQualityAdminSourceRow } from '@synq/evaluations-insights/evaluations-data-quality-panel.contract';
import { useLanguage } from '../../i18n/LanguageContext';
import { cn } from '../../../components/ui/utils';
import { EvaluationsDataQualityStateBadge } from './EvaluationsDataQualityStateBadge';
import {
  navigateToDataQualityRemediation,
  type EvaluationsDataQualityNavigationOptions,
} from '../../lib/evaluations-data-quality-navigation';

interface EvaluationsDataQualitySourceCardProps {
  row: EvaluationsDataQualityAdminSourceRow;
  onNavigate?: (view: string, options?: EvaluationsDataQualityNavigationOptions) => void;
  compact?: boolean;
}

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

export function EvaluationsDataQualitySourceCard({
  row,
  onNavigate,
  compact = false,
}: EvaluationsDataQualitySourceCardProps) {
  const { t, locale } = useLanguage();
  const intlLocale = locale === 'de' ? 'de-DE' : 'en-US';

  const stateLabel = t(`evaluations.dataQuality.state.${row.overallState}`);
  const connectionLabel = t(`evaluations.dataQuality.connection.${row.connectionStatus}`);
  const issueLabel = t(`evaluations.dataQuality.issueKind.${row.issueKind}`);
  const remediationLabel = t(`evaluations.dataQuality.remediation.${row.remediationTarget}`);

  return (
    <article
      className={cn(
        'rounded-xl border border-border/50 surface-premium/40 p-3',
        compact && 'p-2.5',
      )}
      aria-labelledby={`dq-source-${row.sourceKey}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h4 id={`dq-source-${row.sourceKey}`} className="text-[12px] font-semibold text-foreground truncate">
            {t(`evaluations.dataQuality.source.${row.sourceKey}`)}
          </h4>
          <p className="text-[10px] text-muted-foreground mt-0.5">{issueLabel}</p>
        </div>
        <EvaluationsDataQualityStateBadge state={row.overallState} label={stateLabel} />
      </div>

      <dl className={cn('grid gap-2 text-[10.5px]', compact ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3')}>
        <div>
          <dt className="text-muted-foreground">{t('evaluations.dataQuality.field.connection')}</dt>
          <dd className="font-medium text-foreground">{connectionLabel}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('evaluations.dataQuality.field.freshness')}</dt>
          <dd className="font-medium text-foreground">
            {row.freshnessState
              ? t(`evaluations.dataQuality.freshness.${row.freshnessState}`)
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('evaluations.dataQuality.field.coverage')}</dt>
          <dd className="font-medium tabular-nums text-foreground">
            {row.coveragePercent != null ? `${Math.round(row.coveragePercent)}%` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('evaluations.dataQuality.field.errorRate')}</dt>
          <dd className="font-medium tabular-nums text-foreground">
            {row.errorRatePercent != null ? `${row.errorRatePercent}%` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('evaluations.dataQuality.field.lastImport')}</dt>
          <dd className="font-medium text-foreground">{formatDate(row.lastSuccessfulImportAt, intlLocale)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('evaluations.dataQuality.field.lastFailedJob')}</dt>
          <dd className="font-medium text-foreground">{row.lastFailedJobLabel ?? '—'}</dd>
        </div>
      </dl>

      {row.affectedMetrics.length > 0 ? (
        <div className="mt-2">
          <p className="text-[10px] font-medium text-muted-foreground">
            {t('evaluations.dataQuality.field.affectedMetrics')}
          </p>
          <ul className="mt-1 flex flex-wrap gap-1" aria-label={t('evaluations.dataQuality.field.affectedMetrics')}>
            {row.affectedMetrics.slice(0, 4).map((metric) => (
              <li
                key={metric}
                className="rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground"
              >
                {metric}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {row.excludedRecordCount > 0 || row.exclusionSummaries.length > 0 ? (
        <div className="mt-2 text-[10px] text-muted-foreground">
          <span className="font-medium">{t('evaluations.dataQuality.field.excludedRecords')}: </span>
          <span className="tabular-nums">{row.excludedRecordCount}</span>
          {row.exclusionSummaries[0] ? (
            <span className="block mt-0.5">{row.exclusionSummaries[0]}</span>
          ) : null}
        </div>
      ) : null}

      {row.recommendedActions.length > 0 ? (
        <div className="mt-2">
          <p className="text-[10px] font-medium text-muted-foreground">
            {t('evaluations.dataQuality.field.recommendedAction')}
          </p>
          <p className="text-[10.5px] text-foreground mt-0.5">{row.recommendedActions[0]}</p>
        </div>
      ) : null}

      {row.knownIssueSummaries.length > 0 ? (
        <ul className="mt-2 space-y-1" aria-label={t('evaluations.dataQuality.field.knownIssues')}>
          {row.knownIssueSummaries.slice(0, 2).map((msg) => (
            <li key={msg} className="text-[10px] text-muted-foreground leading-snug">
              {msg}
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={() => navigateToDataQualityRemediation(row.remediationTarget, onNavigate)}
        className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-[color:var(--brand)] hover:underline"
      >
        {remediationLabel}
        <ExternalLink className="h-3 w-3" aria-hidden />
      </button>
    </article>
  );
}
