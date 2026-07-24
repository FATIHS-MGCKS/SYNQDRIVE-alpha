/**
 * Risk, cost & downtime visualization resolvers (Prompt 33/54).
 */
import type { EvaluationsAnalyticsSummaryResponse } from './evaluations-analytics-summary.contract';
import type { EvaluationsRiskDriverCategory } from './evaluations-driver-analysis.contract';
import {
  EVALUATIONS_RISK_COST_VIZ_VERSION,
  type AgingBucket,
  type CostDowntimeSeriesResult,
  type CostParetoResult,
  type CostWaterfallResult,
  type DimensionComparisonItem,
  type DimensionComparisonMode,
  type DimensionComparisonResult,
  type FleetFailureTrendResult,
  type ParetoItem,
  type ReceivablesAgingResult,
  type RiskCostVisualizationBundle,
  type RiskMatrixPoint,
  type RiskMatrixResult,
  type TimeSeriesPoint,
  type VizConfidence,
  type VizPeriodContext,
  type WaterfallStep,
} from './evaluations-risk-cost-visualizations.contract';

function clampScale(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scaleToFive(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 1;
  return clampScale(Math.ceil((value / max) * 5), 1, 5);
}

function safeShare(part: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((part / total) * 1000) / 10;
}

function periodContext(summary: EvaluationsAnalyticsSummaryResponse | null | undefined): VizPeriodContext {
  const currency =
    summary?.financial?.data?.currency ??
    summary?.costs?.data?.currency ??
    summary?.receivables?.data?.currency ??
    'EUR';
  return {
    period: summary?.period ?? { key: 'mtd', label: '', from: '', to: '', timezone: 'UTC' },
    comparisonPeriod: summary?.comparisonPeriod ?? {
      key: 'prev',
      label: '',
      from: '',
      to: '',
      timezone: 'UTC',
    },
    currency,
  };
}

const RISK_CATEGORY_LABELS: Record<EvaluationsRiskDriverCategory, string> = {
  BUSINESS_RISK: 'Business risks',
  REVENUE_LEAKAGE: 'Revenue leakage',
  COMPLIANCE: 'Compliance risks',
  CRITICAL_INSIGHTS: 'Critical insights',
};

export function resolveRiskMatrix(
  summary: EvaluationsAnalyticsSummaryResponse | null | undefined,
): RiskMatrixResult {
  const ctx = periodContext(summary);
  const risks = summary?.activeRisks?.data;
  const driverOutcomes = risks?.driverOutcomes ?? summary?.driverAnalysis?.data?.riskDrivers ?? [];

  const categories: Array<{
    category: EvaluationsRiskDriverCategory;
    count: number;
    title: string;
  }> = driverOutcomes.length
    ? driverOutcomes.map((d) => ({
        category: d.category,
        count: d.insightGroupCount,
        title: d.title,
      }))
    : risks
      ? [
          { category: 'BUSINESS_RISK' as const, count: risks.businessRiskGroups, title: RISK_CATEGORY_LABELS.BUSINESS_RISK },
          { category: 'REVENUE_LEAKAGE' as const, count: risks.revenueLeakageGroups, title: RISK_CATEGORY_LABELS.REVENUE_LEAKAGE },
          { category: 'COMPLIANCE' as const, count: risks.complianceInsightGroups, title: RISK_CATEGORY_LABELS.COMPLIANCE },
          { category: 'CRITICAL_INSIGHTS' as const, count: risks.criticalInsights, title: RISK_CATEGORY_LABELS.CRITICAL_INSIGHTS },
        ].filter((c) => c.count > 0)
      : [];

  const maxCount = Math.max(...categories.map((c) => c.count), 1);
  const totalExposure = risks?.estimatedExposureMinor ?? 0;
  const totalGroups = categories.reduce((s, c) => s + c.count, 0) || 1;

  const points: RiskMatrixPoint[] = categories.map((c) => {
    const exposureShare =
      totalExposure > 0 ? Math.round((totalExposure * c.count) / totalGroups) : null;
    const confidence: VizConfidence =
      summary?.insights?.data?.stale ? 'LOW' : c.count >= 3 ? 'HIGH' : 'MEDIUM';

    return {
      id: c.category,
      category: c.category,
      label: c.title,
      probability: scaleToFive(c.count, maxCount),
      impact: scaleToFive(exposureShare ?? c.count, totalExposure > 0 ? totalExposure : maxCount),
      groupCount: c.count,
      exposureMinor: exposureShare,
      currency: risks?.exposureCurrency ?? ctx.currency,
      isEstimate: true,
      confidence,
      drillDownSection: c.category === 'COMPLIANCE' ? 'risks' : 'finance',
    };
  });

  return {
    points,
    periodLabel: ctx.period.label,
    hasData: points.length > 0,
  };
}

export function resolveCostWaterfall(
  summary: EvaluationsAnalyticsSummaryResponse | null | undefined,
): CostWaterfallResult {
  const ctx = periodContext(summary);
  const costModel = summary?.costModel?.data;
  const totals = costModel?.totals;

  if (!totals) {
    return { steps: [], currency: ctx.currency, periodLabel: ctx.period.label, hasData: false };
  }

  const fixed = totals.estimatedFixedCostsMinor;
  const damage = totals.recordedDamageCostsMinor;
  const maintenance = totals.recordedMaintenanceCostsMinor;
  const actual = totals.actualExpensesMinor;
  const otherVariable = Math.max(0, actual - damage - maintenance);

  let running = 0;
  const steps: WaterfallStep[] = [];

  const pushStep = (step: Omit<WaterfallStep, 'startMinor' | 'endMinor'>) => {
    const start = running;
    const delta = step.valueMinor ?? 0;
    if (step.kind === 'start') {
      running = delta;
    } else if (step.kind === 'increment') {
      running += delta;
    } else if (step.kind === 'decrement') {
      running -= delta;
    } else {
      running = delta;
    }
    steps.push({ ...step, startMinor: start, endMinor: running });
  };

  pushStep({
    key: 'fixed',
    label: 'Estimated fixed costs',
    valueMinor: fixed,
    kind: 'start',
    isEstimate: true,
    status: 'ESTIMATED',
  });
  pushStep({
    key: 'damage',
    label: 'Damage repair costs',
    valueMinor: damage,
    kind: 'increment',
    isEstimate: false,
    status: 'ACTUAL',
  });
  pushStep({
    key: 'maintenance',
    label: 'Maintenance costs',
    valueMinor: maintenance,
    kind: 'increment',
    isEstimate: false,
    status: 'ACTUAL',
  });
  pushStep({
    key: 'variable',
    label: 'Other operating expenses',
    valueMinor: otherVariable,
    kind: 'increment',
    isEstimate: false,
    status: actual > 0 ? 'ACTUAL' : 'PARTIAL',
  });
  pushStep({
    key: 'total',
    label: 'Total operating expenses',
    valueMinor: actual,
    kind: 'total',
    isEstimate: false,
    status: 'ACTUAL',
  });

  return {
    steps,
    currency: costModel?.currency ?? ctx.currency,
    periodLabel: ctx.period.label,
    hasData: actual > 0 || fixed > 0,
  };
}

function findCostBreakdown(
  summary: EvaluationsAnalyticsSummaryResponse | null | undefined,
): { dimension: CostParetoResult['dimension']; items: ParetoItem[]; isEstimate: boolean } | null {
  const metrics = summary?.costModel?.data?.metrics ?? [];
  const station = metrics.find((m) => m.key === 'COST_BY_STATION' && m.breakdown?.length);
  if (station?.breakdown?.length) {
    return {
      dimension: 'STATION',
      isEstimate: station.status === 'ESTIMATED' || station.status === 'PARTIAL',
      items: buildParetoItems(station.breakdown.map((b) => ({ key: b.key, label: b.label, valueMinor: b.valueMinor }))),
    };
  }
  const vehicleClass = metrics.find((m) => m.key === 'COST_BY_VEHICLE_CLASS' && m.breakdown?.length);
  if (vehicleClass?.breakdown?.length) {
    return {
      dimension: 'VEHICLE_CLASS',
      isEstimate: vehicleClass.status === 'ESTIMATED' || vehicleClass.status === 'PARTIAL',
      items: buildParetoItems(
        vehicleClass.breakdown.map((b) => ({ key: b.key, label: b.label, valueMinor: b.valueMinor })),
      ),
    };
  }
  return null;
}

function buildParetoItems(
  raw: Array<{ key: string; label: string; valueMinor: number }>,
): ParetoItem[] {
  const sorted = [...raw].sort((a, b) => b.valueMinor - a.valueMinor);
  const total = sorted.reduce((s, i) => s + i.valueMinor, 0);
  let cumulative = 0;
  return sorted.map((item) => {
    cumulative += item.valueMinor;
    return {
      key: item.key,
      label: item.label,
      valueMinor: item.valueMinor,
      sharePercent: safeShare(item.valueMinor, total) ?? 0,
      cumulativePercent: safeShare(cumulative, total) ?? 0,
    };
  });
}

export function resolveCostPareto(
  summary: EvaluationsAnalyticsSummaryResponse | null | undefined,
): CostParetoResult {
  const ctx = periodContext(summary);
  const breakdown = findCostBreakdown(summary);
  if (!breakdown) {
    return {
      items: [],
      dimension: 'STATION',
      currency: ctx.currency,
      periodLabel: ctx.period.label,
      hasData: false,
      isEstimate: false,
    };
  }
  return {
    items: breakdown.items,
    dimension: breakdown.dimension,
    currency: summary?.costModel?.data?.currency ?? ctx.currency,
    periodLabel: ctx.period.label,
    hasData: breakdown.items.length > 0,
    isEstimate: breakdown.isEstimate,
  };
}

export function resolveCostDowntimeSeries(
  summary: EvaluationsAnalyticsSummaryResponse | null | undefined,
): CostDowntimeSeriesResult {
  const ctx = periodContext(summary);
  const financial = summary?.financial?.data;
  const downtime = summary?.downtime?.data;
  const util = summary?.utilizationModel?.data;

  const currentCosts = financial?.expensesMtdMinor ?? null;
  const previousCosts = financial?.expensesPreviousMinor ?? null;
  const currentDowntimePct = downtime?.downtimePercent ?? null;

  const fleetCapacityMs = util?.totals?.fleetCapacityMs ?? 0;
  const unplannedMs = util?.totals?.unplannedDowntimeMs ?? 0;
  const derivedDowntimePct =
    currentDowntimePct ??
    (fleetCapacityMs > 0 ? Math.round((unplannedMs / fleetCapacityMs) * 1000) / 10 : null);

  const points: TimeSeriesPoint[] = [
    {
      key: 'comparison',
      label: ctx.comparisonPeriod.label || 'Previous period',
      costsMinor: previousCosts,
      downtimePercent: null,
      isEstimate: false,
    },
    {
      key: 'current',
      label: ctx.period.label || 'Current period',
      costsMinor: currentCosts,
      downtimePercent: derivedDowntimePct,
      isEstimate: derivedDowntimePct != null && downtime?.downtimePercent == null,
    },
  ];

  return {
    points,
    currency: financial?.currency ?? ctx.currency,
    periodLabel: ctx.period.label,
    hasData: currentCosts != null || derivedDowntimePct != null,
  };
}

export function resolveReceivablesAging(
  summary: EvaluationsAnalyticsSummaryResponse | null | undefined,
): ReceivablesAgingResult {
  const ctx = periodContext(summary);
  const receivables = summary?.receivables?.data;
  const driverSnapshot = summary?.driverAnalysis?.data;

  const open = receivables?.openAmountMinor ?? 0;
  const overdue = receivables?.overdueAmountMinor ?? 0;
  const current = Math.max(0, open - overdue);

  const buckets: AgingBucket[] = [
    {
      key: 'current',
      label: 'Current (not yet overdue)',
      amountMinor: current,
      count: Math.max(0, (receivables?.openCount ?? 0) - (receivables?.overdueCount ?? 0)),
      sharePercent: safeShare(current, open),
    },
    {
      key: 'overdue',
      label: 'Overdue (past due date)',
      amountMinor: overdue,
      count: receivables?.overdueCount ?? 0,
      sharePercent: safeShare(overdue, open),
    },
  ].filter((b) => b.amountMinor > 0 || b.count > 0);

  const hasDriverBuckets =
    driverSnapshot != null &&
    summary?.driverAnalysis?.status === 'OK' &&
    buckets.length > 0;

  return {
    buckets,
    currency: receivables?.currency ?? ctx.currency,
    periodLabel: ctx.period.label,
    totalOpenMinor: open,
    hasData: hasDriverBuckets || open > 0,
  };
}

export function resolveFleetFailureTrend(
  summary: EvaluationsAnalyticsSummaryResponse | null | undefined,
): FleetFailureTrendResult {
  const ctx = periodContext(summary);
  const downtime = summary?.downtime?.data;

  const points = [
    {
      key: 'comparison',
      label: ctx.comparisonPeriod.label || 'Previous period',
      maintenanceVehicles: null,
      blockedVehicles: null,
      cleaningVehicles: null,
      downtimePercent: null,
      isEstimate: false,
    },
    {
      key: 'current',
      label: ctx.period.label || 'Current period',
      maintenanceVehicles: downtime?.maintenanceVehicles ?? null,
      blockedVehicles: downtime?.blockedVehicles ?? null,
      cleaningVehicles: downtime?.cleaningRequiredVehicles ?? null,
      downtimePercent: downtime?.downtimePercent ?? null,
      isEstimate: false,
    },
  ];

  return {
    points,
    periodLabel: ctx.period.label,
    hasData:
      (downtime?.totalDowntimeVehicles ?? 0) > 0 || downtime?.downtimePercent != null,
  };
}

export function resolveDimensionComparison(
  summary: EvaluationsAnalyticsSummaryResponse | null | undefined,
  mode: DimensionComparisonMode = 'STATION',
): DimensionComparisonResult {
  const ctx = periodContext(summary);
  const costModel = summary?.costModel?.data;
  const utilModel = summary?.utilizationModel?.data;

  const costMetricKey = mode === 'STATION' ? 'COST_BY_STATION' : 'COST_BY_VEHICLE_CLASS';
  const utilMetricKey = mode === 'STATION' ? 'UTILIZATION_BY_STATION' : 'UTILIZATION_BY_VEHICLE_CLASS';

  const costMetric = costModel?.metrics.find((m) => m.key === costMetricKey);
  const utilMetric = utilModel?.metrics.find((m) => m.key === utilMetricKey);
  const orgUtil = utilModel?.metrics.find((m) => m.key === 'UTILIZATION_PER_VEHICLE')?.valuePercent ?? null;

  const items: DimensionComparisonItem[] = [];

  if (costMetric?.breakdown?.length) {
    for (const b of costMetric.breakdown) {
      const utilItem = utilMetric?.breakdown?.find((u) => u.key === b.key);
      items.push({
        key: b.key,
        label: b.label,
        value: b.valueMinor,
        unit: 'currency_minor',
        vehicleCount: b.vehicleCount ?? utilItem?.vehicleCount ?? null,
        deltaVsOrg:
          utilItem?.utilizationPercent != null && orgUtil != null
            ? Math.round((utilItem.utilizationPercent - orgUtil) * 10) / 10
            : null,
      });
    }
  } else if (utilMetric?.breakdown?.length) {
    for (const b of utilMetric.breakdown) {
      items.push({
        key: b.key,
        label: b.label,
        value: b.utilizationPercent,
        unit: 'percent',
        vehicleCount: b.vehicleCount,
        deltaVsOrg:
          b.utilizationPercent != null && orgUtil != null
            ? Math.round((b.utilizationPercent - orgUtil) * 10) / 10
            : null,
      });
    }
  }

  items.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return {
    mode,
    items: items.slice(0, 12),
    currency: costModel?.currency ?? ctx.currency,
    periodLabel: ctx.period.label,
    hasData: items.length > 0,
    isEstimate:
      costMetric?.status === 'ESTIMATED' ||
      costMetric?.status === 'PARTIAL' ||
      utilMetric?.status === 'PARTIAL',
  };
}

export function resolveRiskCostVisualizations(
  summary: EvaluationsAnalyticsSummaryResponse | null | undefined,
  options?: { comparisonMode?: DimensionComparisonMode },
): RiskCostVisualizationBundle {
  const ctx = periodContext(summary);
  return {
    calculationVersion: EVALUATIONS_RISK_COST_VIZ_VERSION,
    periodContext: ctx,
    riskMatrix: resolveRiskMatrix(summary),
    costWaterfall: resolveCostWaterfall(summary),
    costPareto: resolveCostPareto(summary),
    costDowntimeSeries: resolveCostDowntimeSeries(summary),
    receivablesAging: resolveReceivablesAging(summary),
    fleetFailureTrend: resolveFleetFailureTrend(summary),
    dimensionComparison: resolveDimensionComparison(summary, options?.comparisonMode ?? 'STATION'),
  };
}
