import { ArrowDownRight, ArrowUpRight, ChevronRight, HelpCircle, Minus } from 'lucide-react';
import type { ExecutiveKpiResolvedCard } from '@synq/evaluations-insights/evaluations-executive-kpi-registry.contract';
import {
  executiveKpiUnitLabel,
  formatExecutiveKpiCoverage,
  formatExecutiveKpiFreshness,
} from '@synq/evaluations-insights/evaluations-executive-kpi-registry';
import { EvaluationsMetricValue } from './EvaluationsMetricValue';
import { EvaluationsMetricStateBadge } from './EvaluationsMetricStateBadge';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../components/ui/tooltip';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import { EVALUATIONS_SECTION_IDS } from './evaluations-page.constants';
import type { ExecutiveKpiDrillDownSection } from '@synq/evaluations-insights/evaluations-executive-kpi-registry.contract';

const DRILL_DOWN_ANCHORS: Record<ExecutiveKpiDrillDownSection, string> = {
  finance: EVALUATIONS_SECTION_IDS.finance,
  fleet: EVALUATIONS_SECTION_IDS.fleet,
  costs_downtime: EVALUATIONS_SECTION_IDS.costsDowntime,
  risks: EVALUATIONS_SECTION_IDS.risks,
  executive: EVALUATIONS_SECTION_IDS.executive,
};

function deltaToneClass(tone: ExecutiveKpiResolvedCard['deltaTone']): string {
  if (tone === 'favorable') return 'sq-tone-success';
  if (tone === 'unfavorable') return 'sq-tone-warning';
  return 'text-muted-foreground';
}

interface EvaluationsExecutiveKpiCardProps {
  card: ExecutiveKpiResolvedCard;
  analyticsLocale: 'de' | 'en';
}

export function EvaluationsExecutiveKpiCard({ card, analyticsLocale }: EvaluationsExecutiveKpiCardProps) {
  const { t } = useLanguage();
  const titleKey = `evaluations.executiveKpi.${card.id}.title` as TranslationKey;
  const definitionKey = `evaluations.executiveKpi.${card.id}.definition` as TranslationKey;
  const anchor = DRILL_DOWN_ANCHORS[card.drillDownSection];
  const coverageLabel = formatExecutiveKpiCoverage(card.coveragePercent, analyticsLocale);
  const freshnessLabel = formatExecutiveKpiFreshness(card.freshnessState, analyticsLocale);
  const unitLabel = executiveKpiUnitLabel(card.valueUnit, analyticsLocale);

  const showDelta =
    card.percentDelta != null ||
    (card.absoluteDeltaDisplay != null && card.id === 'paid_revenue_mtd');

  return (
    <article
      className={cn(
        'group relative flex min-h-[148px] min-w-[min(100%,280px)] snap-start flex-col',
        'rounded-xl border border-border/45 surface-premium/60 p-3.5 shadow-[var(--shadow-1)]',
        'transition-shadow hover:shadow-[var(--shadow-2)]',
        card.state.showStaleOverlay && 'ring-1 ring-[color:var(--status-watch)]/30',
      )}
      aria-labelledby={`exec-kpi-${card.id}-title`}
    >
      <header className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3
              id={`exec-kpi-${card.id}-title`}
              className="truncate text-[11.5px] font-semibold leading-tight tracking-[-0.01em] text-foreground"
            >
              {t(titleKey)}
            </h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="shrink-0 rounded-md p-0.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  aria-label={t('evaluations.executiveKpi.definitionAria')}
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                {t(definitionKey)}
              </TooltipContent>
            </Tooltip>
          </div>
          {card.periodLabel ? (
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">{card.periodLabel}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {card.isEstimate ? (
            <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide sq-tone-watch">
              {t('evaluations.executiveKpi.estimateBadge')}
            </span>
          ) : null}
          {card.isForecast ? (
            <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide sq-tone-brand">
              {t('evaluations.executiveKpi.forecastBadge')}
            </span>
          ) : null}
        </div>
      </header>

      <div className="mb-2 flex items-baseline gap-1.5">
        <EvaluationsMetricValue
          state={card.state}
          locale={analyticsLocale}
          valueClassName="text-[22px] font-semibold leading-none tracking-[-0.03em]"
          skeletonClassName="h-8 w-24"
          showBadge={false}
        />
        {card.state.canShowValue && card.valueUnit !== 'currency_minor' ? (
          <span className="text-[11px] font-medium text-muted-foreground">{unitLabel}</span>
        ) : null}
        <EvaluationsMetricStateBadge kind={card.state.kind} locale={analyticsLocale} className="ml-auto" />
      </div>

      <div className="mt-auto space-y-1.5">
        {card.comparisonDisplay != null ? (
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-[10.5px]">
            <span className="text-muted-foreground">
              {card.id === 'paid_revenue_mtd'
                ? t('evaluations.executiveKpi.vsIssuedRevenue')
                : card.comparisonPeriodLabel
                  ? t('evaluations.executiveKpi.vsPeriod', { period: card.comparisonPeriodLabel })
                  : t('evaluations.executiveKpi.comparison')}
            </span>
            <span className="font-medium tabular-nums text-foreground">{card.comparisonDisplay}</span>
          </div>
        ) : null}

        {showDelta ? (
          <div
            className={cn(
              'inline-flex flex-wrap items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums',
              deltaToneClass(card.deltaTone),
            )}
          >
            {card.percentDelta != null ? (
              <>
                {card.percentDelta > 0 ? (
                  <ArrowUpRight className="h-3 w-3" aria-hidden />
                ) : card.percentDelta < 0 ? (
                  <ArrowDownRight className="h-3 w-3" aria-hidden />
                ) : (
                  <Minus className="h-3 w-3" aria-hidden />
                )}
                <span>
                  {card.percentDelta >= 0 ? '+' : '−'}
                  {Math.abs(card.percentDelta).toFixed(1)}%
                </span>
              </>
            ) : null}
            {card.absoluteDeltaDisplay ? (
              <span className={card.percentDelta != null ? 'opacity-90' : ''}>
                {card.id === 'paid_revenue_mtd'
                  ? t('evaluations.executiveKpi.collectionRate', { rate: card.absoluteDeltaDisplay })
                  : card.absoluteDeltaDisplay}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
          {coverageLabel ? <span className="rounded-md bg-muted/50 px-1.5 py-0.5">{coverageLabel}</span> : null}
          {freshnessLabel ? <span className="rounded-md bg-muted/50 px-1.5 py-0.5">{freshnessLabel}</span> : null}
        </div>

        <a
          href={`#${anchor}`}
          className="inline-flex items-center gap-0.5 text-[10.5px] font-semibold text-[color:var(--brand)] hover:underline"
        >
          {t('evaluations.executiveKpi.drillDown')}
          <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </a>
      </div>
    </article>
  );
}
