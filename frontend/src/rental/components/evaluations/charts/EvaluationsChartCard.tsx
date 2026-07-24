import type { ReactNode } from 'react';
import { EmptyState } from '../../../../components/patterns';
import { cn } from '../../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import {
  EVALUATIONS_CHART_DESKTOP_ONLY_CLASS,
  EVALUATIONS_CHART_MOBILE_HINT_CLASS,
} from '../evaluations-responsive.constants';

export interface EvaluationsChartCardProps {
  title: string;
  subtitle?: string;
  periodLabel?: string;
  unitLabel?: string;
  question: string;
  isEstimate?: boolean;
  isForecast?: boolean;
  estimateLabel?: string;
  forecastLabel?: string;
  hasData: boolean;
  emptyTitle: string;
  emptyDescription: string;
  chartId: string;
  tableCaption: string;
  children: ReactNode;
  tableAlternative: ReactNode;
  className?: string;
}

export function EvaluationsChartCard({
  title,
  subtitle,
  periodLabel,
  unitLabel,
  question,
  isEstimate,
  isForecast,
  estimateLabel = 'Estimate',
  forecastLabel = 'Forecast',
  hasData,
  emptyTitle,
  emptyDescription,
  chartId,
  tableCaption,
  children,
  tableAlternative,
  className,
}: EvaluationsChartCardProps) {
  const { t } = useLanguage();

  return (
    <article
      className={cn(
        'surface-premium rounded-2xl border border-border/40 p-3 shadow-[var(--shadow-1)] sm:p-4',
        className,
      )}
      aria-labelledby={`${chartId}-title`}
    >
      <header className="mb-3 space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 id={`${chartId}-title`} className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">
              {title}
            </h3>
            {subtitle ? <p className="text-[10.5px] text-muted-foreground">{subtitle}</p> : null}
            <p className="mt-1 text-[10px] italic text-muted-foreground">{question}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1">
            {isEstimate ? (
              <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase sq-tone-watch">
                {estimateLabel}
              </span>
            ) : null}
            {isForecast ? (
              <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase sq-tone-brand">
                {forecastLabel}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
          {periodLabel ? <span className="rounded-md bg-muted/50 px-1.5 py-0.5">{periodLabel}</span> : null}
          {unitLabel ? <span className="rounded-md bg-muted/50 px-1.5 py-0.5">{unitLabel}</span> : null}
        </div>
      </header>

      {hasData ? (
        <p
          className={EVALUATIONS_CHART_MOBILE_HINT_CLASS}
          data-testid={`${chartId}-mobile-hint`}
        >
          {t('evaluations.responsive.chartMobileHint')}
        </p>
      ) : null}

      <div
        className={cn(
          'relative',
          hasData ? cn('min-h-0 md:min-h-[200px]', EVALUATIONS_CHART_DESKTOP_ONLY_CLASS) : 'min-h-[200px]',
        )}
        role="img"
        aria-labelledby={`${chartId}-title`}
        aria-describedby={`${chartId}-table`}
      >
        {!hasData ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <EmptyState compact title={emptyTitle} description={emptyDescription} />
          </div>
        ) : null}
        <div className={cn(!hasData && 'opacity-30 pointer-events-none')}>{children}</div>
      </div>

      <div id={`${chartId}-table`} className="mt-3 border-t border-border/40 pt-3 md:mt-4" data-testid={`${chartId}-table`}>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {tableCaption}
        </p>
        {tableAlternative}
      </div>
    </article>
  );
}
