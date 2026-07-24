import { ChevronRight } from 'lucide-react';
import type { SwCockpitFinding } from '@synq/evaluations-insights/evaluations-sw-cockpit.contract';
import { swCockpitCategoryLabelKey } from '@synq/evaluations-insights/evaluations-sw-cockpit';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';

const CATEGORY_TONE: Record<SwCockpitFinding['category'], string> = {
  STRENGTH: 'sq-tone-success',
  IMPROVEMENT_POTENTIAL: 'sq-tone-brand',
  OBSERVATION: 'text-muted-foreground',
  RISK: 'sq-tone-watch',
  CRITICAL_RISK: 'sq-tone-danger',
};

const CATEGORY_SURFACE: Record<SwCockpitFinding['category'], string> = {
  STRENGTH: 'bg-[color:var(--status-success)]/[0.05] border-[color:var(--status-success)]/20',
  IMPROVEMENT_POTENTIAL: 'bg-[color:var(--brand)]/[0.04] border-[color:var(--brand)]/20',
  OBSERVATION: 'bg-muted/30 border-border/40',
  RISK: 'bg-[color:var(--status-watch)]/[0.05] border-[color:var(--status-watch)]/25',
  CRITICAL_RISK: 'bg-[color:var(--status-danger)]/[0.06] border-[color:var(--status-danger)]/30',
};

interface EvaluationsSwFindingCardProps {
  finding: SwCockpitFinding;
  onSelect: (finding: SwCockpitFinding) => void;
  isSelected?: boolean;
}

export function EvaluationsSwFindingCard({ finding, onSelect, isSelected }: EvaluationsSwFindingCardProps) {
  const { t } = useLanguage();
  const categoryKey = swCockpitCategoryLabelKey(finding.category) as TranslationKey;
  const comparisonKey =
    `evaluations.swCockpit.comparisonBasis.${finding.comparisonBasisKey}` as TranslationKey;
  const dimensionKey =
    `evaluations.swCockpit.dimension.${finding.affectedDimensionKey}` as TranslationKey;
  const confidenceKey = `evaluations.swCockpit.confidence.${finding.confidence}` as TranslationKey;

  const entityParts: string[] = [];
  if (finding.entitySummary.stations > 0) {
    entityParts.push(
      t('evaluations.swCockpit.entity.stations', { count: finding.entitySummary.stations }),
    );
  }
  if (finding.entitySummary.vehicles > 0) {
    entityParts.push(
      t('evaluations.swCockpit.entity.vehicles', { count: finding.entitySummary.vehicles }),
    );
  }
  if (finding.entitySummary.bookings > 0) {
    entityParts.push(
      t('evaluations.swCockpit.entity.bookings', { count: finding.entitySummary.bookings }),
    );
  }
  if (finding.dimensionLabel) {
    entityParts.unshift(finding.dimensionLabel);
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(finding)}
      aria-pressed={isSelected}
      className={cn(
        'group w-full rounded-xl border p-3.5 text-left transition-shadow',
        'hover:shadow-[var(--shadow-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40',
        CATEGORY_SURFACE[finding.category],
        isSelected && 'ring-2 ring-[color:var(--brand)]/50',
      )}
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            CATEGORY_TONE[finding.category],
            'bg-background/60',
          )}
        >
          {t(categoryKey)}
        </span>
        <span className="text-[10px] font-medium text-muted-foreground">{t(confidenceKey)}</span>
      </div>

      <h4 className="text-[13px] font-semibold leading-snug text-foreground">{finding.title}</h4>
      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
        {finding.explanation}
      </p>

      <dl className="mt-3 space-y-1.5 text-[10.5px]">
        {finding.quantitativeBasis ? (
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
            <dt className="text-muted-foreground">{t('evaluations.swCockpit.field.quantitativeBasis')}</dt>
            <dd className="font-medium tabular-nums text-foreground">{finding.quantitativeBasis}</dd>
          </div>
        ) : null}
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
          <dt className="text-muted-foreground">{t('evaluations.swCockpit.field.comparisonBasis')}</dt>
          <dd className="font-medium text-foreground">{t(comparisonKey)}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
          <dt className="text-muted-foreground">{t('evaluations.swCockpit.field.period')}</dt>
          <dd className="font-medium text-foreground">{finding.periodLabel}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
          <dt className="text-muted-foreground">{t('evaluations.swCockpit.field.dimension')}</dt>
          <dd className="font-medium text-foreground">
            {t(dimensionKey)}
            {entityParts.length > 0 ? ` · ${entityParts.join(' · ')}` : ''}
          </dd>
        </div>
        {finding.impact ? (
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
            <dt className="text-muted-foreground">{t('evaluations.swCockpit.field.impact')}</dt>
            <dd className="font-medium text-foreground">
              {finding.impact.label}
              {finding.impact.isEstimate ? ` (${t('evaluations.swCockpit.estimateBadge')})` : ''}
              {finding.impact.isForecast ? ` (${t('evaluations.swCockpit.forecastBadge')})` : ''}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            'rounded-md px-1.5 py-0.5 text-[10px]',
            finding.dataCoverage.isPartial ? 'sq-tone-watch bg-muted/60' : 'bg-muted/50 text-muted-foreground',
          )}
        >
          {finding.dataCoverage.label}
        </span>
        {finding.confidence === 'LOW' ? (
          <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] sq-tone-watch">
            {t('evaluations.swCockpit.lowConfidenceHint')}
          </span>
        ) : null}
      </div>

      <span className="mt-2.5 inline-flex items-center gap-0.5 text-[10.5px] font-semibold text-[color:var(--brand)]">
        {t('evaluations.swCockpit.drillDown')}
        <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}
