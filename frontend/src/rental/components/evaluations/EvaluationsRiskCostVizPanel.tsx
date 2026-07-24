import { useMemo, useState } from 'react';
import type { EvaluationsAnalyticsSummaryResponse } from '@synq/evaluations-insights/evaluations-analytics-summary.contract';
import {
  resolveDimensionComparison,
  resolveRiskCostVisualizations,
} from '@synq/evaluations-insights/evaluations-risk-cost-visualizations';
import type { DimensionComparisonMode } from '@synq/evaluations-insights/evaluations-risk-cost-visualizations.contract';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import { evaluationsIntlLocale } from '../../lib/evaluations-format';
import { EVALUATIONS_DUAL_GRID_CLASS } from './evaluations-responsive.constants';
import { EvaluationsRiskMatrixChart } from './charts/EvaluationsRiskMatrixChart';
import {
  EvaluationsCostDowntimeSeriesChart,
  EvaluationsCostParetoChart,
  EvaluationsCostWaterfallChart,
  EvaluationsDimensionComparisonChart,
  EvaluationsFleetFailureTrendChart,
  EvaluationsReceivablesAgingChart,
} from './charts/EvaluationsRiskCostCharts';

export type RiskCostVizVariant = 'risks' | 'costs' | 'finance';

interface EvaluationsRiskCostVizPanelProps {
  summary: EvaluationsAnalyticsSummaryResponse | null;
  isDarkMode: boolean;
  variant: RiskCostVizVariant;
}

export function EvaluationsRiskCostVizPanel({
  summary,
  isDarkMode,
  variant,
}: EvaluationsRiskCostVizPanelProps) {
  const { t, locale } = useLanguage();
  const intlLocale = evaluationsIntlLocale(locale);
  const [comparisonMode, setComparisonMode] = useState<DimensionComparisonMode>('STATION');

  const viz = useMemo(
    () => resolveRiskCostVisualizations(summary, { comparisonMode }),
    [summary, comparisonMode],
  );

  const dimensionComparison = useMemo(
    () => resolveDimensionComparison(summary, comparisonMode),
    [summary, comparisonMode],
  );

  const commonLabels = {
    estimate: t('evaluations.viz.estimateBadge'),
    emptyTitle: t('evaluations.viz.emptyTitle'),
    emptyDescription: t('evaluations.viz.emptyDescription'),
    tableCaption: t('evaluations.viz.tableCaption'),
    table: {
      step: t('evaluations.viz.table.step'),
      status: t('evaluations.viz.table.status'),
      driver: t('evaluations.viz.table.driver'),
      sharePercent: t('evaluations.viz.table.sharePercent'),
      cumulativePercent: t('evaluations.viz.table.cumulativePercent'),
      cumulativeLegend: t('evaluations.viz.table.cumulativeLegend'),
      period: t('evaluations.viz.table.period'),
      bucket: t('evaluations.viz.table.bucket'),
      count: t('evaluations.viz.table.count'),
      percent: t('evaluations.viz.table.percent'),
      dimension: t('evaluations.viz.table.dimension'),
      vehicles: t('evaluations.viz.table.vehicles'),
      deltaVsOrg: t('evaluations.viz.table.deltaVsOrg'),
      downtimePercent: t('evaluations.viz.table.downtimePercent'),
      dimensionFilter: t('evaluations.viz.dimensionComparison.filterLabel'),
    },
  };

  if (variant === 'risks') {
    return (
      <div className="mb-4">
        <EvaluationsRiskMatrixChart
          data={viz.riskMatrix}
          intlLocale={intlLocale}
          isDarkMode={isDarkMode}
          labels={{
            ...commonLabels,
            title: t('evaluations.viz.riskMatrix.title'),
            question: t('evaluations.viz.riskMatrix.question'),
            period: viz.periodContext.period.label,
            unit: t('evaluations.viz.riskMatrix.unit'),
            colProbability: t('evaluations.viz.riskMatrix.colCategory'),
            colProbabilityShort: t('evaluations.viz.riskMatrix.colProbabilityShort'),
            colImpact: t('evaluations.viz.riskMatrix.colImpact'),
            colExposure: t('evaluations.viz.riskMatrix.colExposure'),
            colGroups: t('evaluations.viz.riskMatrix.colGroups'),
            colConfidence: t('evaluations.viz.riskMatrix.colConfidence'),
            axisImpact: t('evaluations.viz.riskMatrix.axisImpact'),
            axisProbability: t('evaluations.viz.riskMatrix.axisProbability'),
            axisScale: t('evaluations.viz.riskMatrix.axisScale'),
            cellAriaTemplate: t('evaluations.viz.riskMatrix.cellAria'),
            pointTitleTemplate: t('evaluations.viz.riskMatrix.pointTitle'),
            formatConfidence: (level) =>
              t(`evaluations.swCockpit.confidence.${level}` as TranslationKey) || level,
          }}
        />
      </div>
    );
  }

  if (variant === 'finance') {
    return (
      <div className="mb-4">
        <EvaluationsReceivablesAgingChart
          data={viz.receivablesAging}
          intlLocale={intlLocale}
          isDarkMode={isDarkMode}
          labels={{
            ...commonLabels,
            title: t('evaluations.viz.receivablesAging.title'),
            question: t('evaluations.viz.receivablesAging.question'),
            unit: viz.receivablesAging.currency,
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={EVALUATIONS_DUAL_GRID_CLASS}>
        <EvaluationsCostWaterfallChart
          data={viz.costWaterfall}
          intlLocale={intlLocale}
          isDarkMode={isDarkMode}
          labels={{
            ...commonLabels,
            title: t('evaluations.viz.costWaterfall.title'),
            question: t('evaluations.viz.costWaterfall.question'),
            unit: viz.costWaterfall.currency,
          }}
        />
        <EvaluationsCostParetoChart
          data={viz.costPareto}
          intlLocale={intlLocale}
          isDarkMode={isDarkMode}
          labels={{
            ...commonLabels,
            title: t('evaluations.viz.costPareto.title'),
            question: t('evaluations.viz.costPareto.question'),
            unit: viz.costPareto.currency,
          }}
        />
      </div>
      <div className={EVALUATIONS_DUAL_GRID_CLASS}>
        <EvaluationsCostDowntimeSeriesChart
          data={viz.costDowntimeSeries}
          intlLocale={intlLocale}
          isDarkMode={isDarkMode}
          labels={{
            ...commonLabels,
            title: t('evaluations.viz.costDowntimeSeries.title'),
            question: t('evaluations.viz.costDowntimeSeries.question'),
            costsLabel: t('evaluations.viz.costDowntimeSeries.costs'),
            downtimeLabel: t('evaluations.viz.costDowntimeSeries.downtime'),
          }}
        />
        <EvaluationsFleetFailureTrendChart
          data={viz.fleetFailureTrend}
          isDarkMode={isDarkMode}
          labels={{
            ...commonLabels,
            title: t('evaluations.viz.fleetFailure.title'),
            question: t('evaluations.viz.fleetFailure.question'),
            maintenance: t('evaluations.viz.fleetFailure.maintenance'),
            blocked: t('evaluations.viz.fleetFailure.blocked'),
            cleaning: t('evaluations.viz.fleetFailure.cleaning'),
          }}
        />
      </div>
      <EvaluationsDimensionComparisonChart
        data={dimensionComparison}
        intlLocale={intlLocale}
        isDarkMode={isDarkMode}
        mode={comparisonMode}
        onModeChange={setComparisonMode}
        labels={{
          ...commonLabels,
          title: t('evaluations.viz.dimensionComparison.title'),
          question: t('evaluations.viz.dimensionComparison.question'),
          unit: dimensionComparison.currency,
          station: t('evaluations.viz.dimensionComparison.station'),
          vehicleClass: t('evaluations.viz.dimensionComparison.vehicleClass'),
        }}
      />
    </div>
  );
}
