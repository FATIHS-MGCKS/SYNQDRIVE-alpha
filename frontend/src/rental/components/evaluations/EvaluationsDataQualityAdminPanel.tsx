import { useMemo, useState } from 'react';
import { ChevronDown, Database, RefreshCw } from 'lucide-react';
import type { EvaluationsSectionEnvelope } from '@synq/evaluations-insights/evaluations-analytics-primitives.contract';
import type { EvaluationsDataQualityDomainSummary } from '@synq/evaluations-insights/evaluations-data-quality.contract';
import type { EvaluationsLineageSummary } from '@synq/evaluations-insights/evaluations-lineage.contract';
import {
  buildAdminSourceRows,
  isEvaluationsDataQualityAdmin,
} from '@synq/evaluations-insights/evaluations-data-quality-panel';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import { cn } from '../../../components/ui/utils';
import { EmptyState, ErrorState } from '../../../components/patterns';
import { EvaluationsDataQualitySourceCard } from './EvaluationsDataQualitySourceCard';
import { EvaluationsDataQualityStateBadge } from './EvaluationsDataQualityStateBadge';
import type { EvaluationsDataQualityNavigationOptions } from '../../lib/evaluations-data-quality-navigation';

interface EvaluationsDataQualityAdminPanelProps {
  dataQualityEnvelope: EvaluationsSectionEnvelope<EvaluationsDataQualityDomainSummary> | null | undefined;
  lineageData: EvaluationsLineageSummary | null | undefined;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onNavigate?: (view: string, options?: EvaluationsDataQualityNavigationOptions) => void;
}

export function EvaluationsDataQualityAdminPanel({
  dataQualityEnvelope,
  lineageData,
  loading = false,
  error = null,
  onRefresh,
  onNavigate,
}: EvaluationsDataQualityAdminPanelProps) {
  const { t } = useLanguage();
  const { userRole } = useRentalOrg();
  const [expanded, setExpanded] = useState(true);

  const isAdmin = isEvaluationsDataQualityAdmin(userRole);
  const rows = useMemo(
    () => buildAdminSourceRows(dataQualityEnvelope?.data ?? null, lineageData ?? null),
    [dataQualityEnvelope?.data, lineageData],
  );

  if (!isAdmin) return null;

  const rollup = dataQualityEnvelope?.data?.rollupStatus ?? 'MISSING';
  const rollupLabel = t(`evaluations.dataQuality.state.${rollup}`);

  return (
    <section
      className="surface-premium rounded-2xl border border-border/45 shadow-[var(--shadow-1)]"
      aria-labelledby="evaluations-dq-admin-heading"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg sq-tone-info">
            <Database className="h-4 w-4" aria-hidden />
          </div>
          <div>
            <h2 id="evaluations-dq-admin-heading" className="text-[13px] font-semibold text-foreground">
              {t('evaluations.dataQuality.admin.title')}
            </h2>
            <p className="text-[10px] text-muted-foreground">{t('evaluations.dataQuality.admin.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <EvaluationsDataQualityStateBadge state={rollup} label={rollupLabel} />
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-2 py-1 text-[10px] font-semibold hover:bg-muted/60"
              aria-label={t('evaluations.dataQuality.admin.refresh')}
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
              {t('evaluations.dataQuality.admin.refresh')}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-2 py-1 text-[10px] font-semibold hover:bg-muted/60"
            aria-expanded={expanded}
            aria-controls="evaluations-dq-admin-body"
          >
            {expanded ? t('evaluations.dataQuality.admin.collapse') : t('evaluations.dataQuality.admin.expand')}
            <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>
      </header>

      {expanded ? (
        <div id="evaluations-dq-admin-body" className="p-4">
          {loading && rows.length === 0 ? (
            <p className="text-xs text-muted-foreground" role="status">
              {t('evaluations.dataQuality.admin.loading')}
            </p>
          ) : null}

          {error && !dataQualityEnvelope?.data ? (
            <ErrorState
              compact
              title={t('evaluations.dataQuality.admin.errorTitle')}
              description={t('evaluations.dataQuality.admin.errorDescription')}
              onRetry={onRefresh}
              retryLabel={t('evaluations.dataQuality.admin.retry')}
            />
          ) : null}

          {!loading && !error && rows.length === 0 ? (
            <EmptyState
              compact
              title={t('evaluations.dataQuality.admin.emptyTitle')}
              description={t('evaluations.dataQuality.admin.emptyDescription')}
            />
          ) : null}

          {rows.length > 0 ? (
            <div
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"
              role="list"
              aria-label={t('evaluations.dataQuality.admin.sourcesList')}
            >
              {rows.map((row) => (
                <div key={row.sourceKey} role="listitem" className="min-w-0">
                  <EvaluationsDataQualitySourceCard row={row} onNavigate={onNavigate} />
                </div>
              ))}
            </div>
          ) : null}

          {dataQualityEnvelope?.data?.crossCuttingIssues?.length ? (
            <div className="mt-4 rounded-xl border border-border/40 bg-muted/20 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('evaluations.dataQuality.admin.crossCutting')}
              </p>
              <ul className="mt-1 space-y-1">
                {dataQualityEnvelope.data.crossCuttingIssues.slice(0, 3).map((issue) => (
                  <li key={issue.code} className="text-[10.5px] text-foreground">
                    {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
