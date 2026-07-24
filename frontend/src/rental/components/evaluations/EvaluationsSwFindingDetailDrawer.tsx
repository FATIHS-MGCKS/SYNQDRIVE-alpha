import type { ReactNode } from 'react';
import type { SwCockpitFinding } from '@synq/evaluations-insights/evaluations-sw-cockpit.contract';
import { swCockpitCategoryLabelKey } from '@synq/evaluations-insights/evaluations-sw-cockpit';
import { DetailDrawer } from '../../../components/patterns/detail-drawer';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import { EVALUATIONS_SECTION_IDS } from './evaluations-page.constants';
import type { SwCockpitDrillDownSection } from '@synq/evaluations-insights/evaluations-sw-cockpit.contract';

const DRILL_DOWN_ANCHORS: Record<SwCockpitDrillDownSection, string> = {
  finance: EVALUATIONS_SECTION_IDS.finance,
  fleet: EVALUATIONS_SECTION_IDS.fleet,
  costs_downtime: EVALUATIONS_SECTION_IDS.costsDowntime,
  risks: EVALUATIONS_SECTION_IDS.risks,
  executive: EVALUATIONS_SECTION_IDS.executive,
  data_quality: EVALUATIONS_SECTION_IDS.dataQuality,
  actions: EVALUATIONS_SECTION_IDS.actions,
};

const CATEGORY_TONE: Record<SwCockpitFinding['category'], string> = {
  STRENGTH: 'sq-tone-success',
  IMPROVEMENT_POTENTIAL: 'sq-tone-brand',
  OBSERVATION: 'text-muted-foreground',
  RISK: 'sq-tone-watch',
  CRITICAL_RISK: 'sq-tone-danger',
};

interface EvaluationsSwFindingDetailDrawerProps {
  finding: SwCockpitFinding | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="sq-section-label mb-2">{title}</h3>
      <div className="space-y-2 text-[12px] leading-relaxed text-foreground">{children}</div>
    </section>
  );
}

export function EvaluationsSwFindingDetailDrawer({
  finding,
  open,
  onOpenChange,
}: EvaluationsSwFindingDetailDrawerProps) {
  const { t } = useLanguage();

  if (!finding) return null;

  const categoryKey = swCockpitCategoryLabelKey(finding.category) as TranslationKey;
  const comparisonKey =
    `evaluations.swCockpit.comparisonBasis.${finding.comparisonBasisKey}` as TranslationKey;
  const dimensionKey =
    `evaluations.swCockpit.dimension.${finding.affectedDimensionKey}` as TranslationKey;
  const confidenceKey = `evaluations.swCockpit.confidence.${finding.confidence}` as TranslationKey;
  const driver = finding.driverAnalysis;
  const drillAnchor = DRILL_DOWN_ANCHORS[finding.drillDownSection];

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={finding.title}
      eyebrow={t(categoryKey)}
      description={finding.explanation}
      closeLabel={t('evaluations.swCockpit.close')}
      status={
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            CATEGORY_TONE[finding.category],
            'bg-muted/60',
          )}
        >
          {t(categoryKey)}
        </span>
      }
      widthClassName="sm:max-w-xl"
    >
      <DetailSection title={t('evaluations.swCockpit.detail.summary')}>
        <dl className="space-y-2">
          {finding.quantitativeBasis ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t('evaluations.swCockpit.field.quantitativeBasis')}</dt>
              <dd className="font-medium tabular-nums">{finding.quantitativeBasis}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t('evaluations.swCockpit.field.comparisonBasis')}</dt>
            <dd className="font-medium">{t(comparisonKey)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t('evaluations.swCockpit.field.period')}</dt>
            <dd className="font-medium">
              {finding.periodLabel}
              {finding.comparisonPeriodLabel
                ? ` · ${t('evaluations.swCockpit.vsPeriod', { period: finding.comparisonPeriodLabel })}`
                : ''}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t('evaluations.swCockpit.field.dimension')}</dt>
            <dd className="font-medium text-right">
              {t(dimensionKey)}
              {finding.dimensionLabel ? ` — ${finding.dimensionLabel}` : ''}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t('evaluations.swCockpit.field.confidence')}</dt>
            <dd className="font-medium">{t(confidenceKey)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t('evaluations.swCockpit.field.coverage')}</dt>
            <dd className="font-medium">{finding.dataCoverage.label}</dd>
          </div>
          {finding.impact ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t('evaluations.swCockpit.field.impact')}</dt>
              <dd className="font-medium text-right">{finding.impact.label}</dd>
            </div>
          ) : null}
        </dl>
      </DetailSection>

      {finding.rationale ? (
        <DetailSection title={t('evaluations.swCockpit.detail.rationale')}>
          <p className="text-muted-foreground">{finding.rationale}</p>
        </DetailSection>
      ) : null}

      {finding.recommendation ? (
        <DetailSection title={t('evaluations.swCockpit.detail.recommendation')}>
          <p>{finding.recommendation}</p>
        </DetailSection>
      ) : null}

      {finding.underlyingKpis.length > 0 ? (
        <DetailSection title={t('evaluations.swCockpit.detail.dataSources')}>
          <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
            {finding.underlyingKpis.map((kpi) => (
              <li key={kpi}>{kpi}</li>
            ))}
          </ul>
        </DetailSection>
      ) : null}

      {(finding.entitySummary.vehicles > 0 ||
        finding.entitySummary.stations > 0 ||
        finding.entitySummary.bookings > 0) && (
        <DetailSection title={t('evaluations.swCockpit.detail.entities')}>
          <ul className="space-y-1 text-muted-foreground">
            {finding.entitySummary.stations > 0 ? (
              <li>
                {t('evaluations.swCockpit.entity.stations', {
                  count: finding.entitySummary.stations,
                })}
              </li>
            ) : null}
            {finding.entitySummary.vehicles > 0 ? (
              <li>
                {t('evaluations.swCockpit.entity.vehicles', {
                  count: finding.entitySummary.vehicles,
                })}
              </li>
            ) : null}
            {finding.entitySummary.bookings > 0 ? (
              <li>
                {t('evaluations.swCockpit.entity.bookings', {
                  count: finding.entitySummary.bookings,
                })}
              </li>
            ) : null}
          </ul>
        </DetailSection>
      )}

      {driver ? (
        <>
          <DetailSection title={t('evaluations.swCockpit.detail.causes')}>
            {driver.primaryFactors.length > 0 ? (
              <ul className="space-y-2">
                {driver.primaryFactors.map((factor) => (
                  <li key={factor.key} className="rounded-lg border border-border/40 bg-muted/20 p-2.5">
                    <p className="font-semibold">{factor.label}</p>
                    <p className="mt-0.5 text-muted-foreground">{factor.description}</p>
                    <p className="mt-1 text-[10.5px] text-muted-foreground">
                      {t('evaluations.swCockpit.detail.source')}: {factor.dataSource}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">{t('evaluations.swCockpit.detail.noCauses')}</p>
            )}
            {driver.disclaimer ? (
              <p className="mt-2 text-[10.5px] italic text-muted-foreground">{driver.disclaimer}</p>
            ) : null}
          </DetailSection>

          {driver.secondaryFactors.length > 0 ? (
            <DetailSection title={t('evaluations.swCockpit.detail.secondaryFactors')}>
              <ul className="space-y-1.5 text-muted-foreground">
                {driver.secondaryFactors.map((factor) => (
                  <li key={factor.key}>
                    <span className="font-medium text-foreground">{factor.label}</span>
                    {' — '}
                    {factor.description}
                  </li>
                ))}
              </ul>
            </DetailSection>
          ) : null}

          {driver.dataQualityWarnings.length > 0 ? (
            <DetailSection title={t('evaluations.swCockpit.detail.warnings')}>
              <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                {driver.dataQualityWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </DetailSection>
          ) : null}
        </>
      ) : null}

      <div className="mt-4 border-t border-border/50 pt-4">
        <a
          href={`#${drillAnchor}`}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[color:var(--brand)] hover:underline"
          onClick={() => onOpenChange(false)}
        >
          {t('evaluations.swCockpit.sectionDrillDown')}
        </a>
      </div>
    </DetailDrawer>
  );
}
