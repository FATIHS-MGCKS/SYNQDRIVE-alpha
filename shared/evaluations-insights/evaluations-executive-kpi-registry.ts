/**
 * Executive KPI metric registry + resolver (Prompt 31/54).
 */
import type { EvaluationsAnalyticsSummaryResponse } from './evaluations-analytics-summary.contract';
import type { EvaluationsSectionEnvelope } from './evaluations-analytics-primitives.contract';
import type { EvaluationsLineageSummary } from './evaluations-lineage.contract';
import { lineageForMetric } from './evaluations-lineage';
import {
  resolveMetricFromEnvelope,
} from './evaluations-metric-state';
import type { EvaluationsMetricFetchPhase } from './evaluations-metric-state.contract';
import type {
  ExecutiveKpiDefinition,
  ExecutiveKpiDeltaSemantics,
  ExecutiveKpiDeltaTone,
  ExecutiveKpiId,
  ExecutiveKpiResolvedCard,
  ExecutiveKpiStripResult,
  ExecutiveKpiValueUnit,
} from './evaluations-executive-kpi-registry.contract';

export const EXECUTIVE_KPI_MAX_CARDS = 8;

export const EXECUTIVE_KPI_REGISTRY: ExecutiveKpiDefinition[] = [
  {
    id: 'revenue_mtd',
    priority: 10,
    lineageMetricKey: 'financial.revenueMtdMinor',
    drillDownSection: 'finance',
    valueUnit: 'currency_minor',
    deltaSemantics: 'higher_is_better',
  },
  {
    id: 'paid_revenue_mtd',
    priority: 20,
    lineageMetricKey: 'financial.paidRevenueMtdMinor',
    drillDownSection: 'finance',
    valueUnit: 'currency_minor',
    deltaSemantics: 'higher_is_better',
  },
  {
    id: 'contribution_margin',
    priority: 30,
    lineageMetricKey: 'financial.netMarginMinor',
    drillDownSection: 'finance',
    valueUnit: 'currency_minor',
    deltaSemantics: 'higher_is_better',
  },
  {
    id: 'fleet_utilization',
    priority: 40,
    lineageMetricKey: 'fleetUtilization.utilizationPercent',
    drillDownSection: 'fleet',
    valueUnit: 'percent',
    deltaSemantics: 'contextual',
  },
  {
    id: 'fleet_availability',
    priority: 50,
    lineageMetricKey: 'vehicleAvailability.readyPercent',
    drillDownSection: 'fleet',
    valueUnit: 'percent',
    deltaSemantics: 'higher_is_better',
  },
  {
    id: 'unplanned_downtime',
    priority: 60,
    lineageMetricKey: 'downtime.downtimePercent',
    drillDownSection: 'costs_downtime',
    valueUnit: 'percent',
    deltaSemantics: 'lower_is_better',
  },
  {
    id: 'financial_risk_exposure',
    priority: 70,
    lineageMetricKey: 'activeRisks.estimatedExposureMinor',
    drillDownSection: 'risks',
    valueUnit: 'currency_minor',
    deltaSemantics: 'lower_is_better',
    isEstimate: true,
    zeroMeansNull: true,
  },
  {
    id: 'overdue_receivables',
    priority: 80,
    lineageMetricKey: 'receivables.overdueAmountMinor',
    drillDownSection: 'finance',
    valueUnit: 'currency_minor',
    deltaSemantics: 'lower_is_better',
    zeroMeansNull: true,
  },
];

export function getExecutiveKpiRegistry(priorityOverrides?: Partial<Record<ExecutiveKpiId, number>>): ExecutiveKpiDefinition[] {
  if (!priorityOverrides || Object.keys(priorityOverrides).length === 0) {
    return [...EXECUTIVE_KPI_REGISTRY];
  }
  return EXECUTIVE_KPI_REGISTRY.map((def) => ({
    ...def,
    priority: priorityOverrides[def.id] ?? def.priority,
  }));
}

function fmtEurMinor(minor: number, locale: 'de' | 'en'): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

function fmtPct(value: number, digits = 1): string {
  return `${value >= 0 ? '' : '-'}${Math.abs(value).toFixed(digits)}%`;
}

function fmtDeltaMinor(delta: number, locale: 'de' | 'en'): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  return `${sign}${fmtEurMinor(Math.abs(delta), locale)}`;
}

function safeDeltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function resolveDeltaTone(
  semantics: ExecutiveKpiDeltaSemantics,
  percentDelta: number | null,
  rawValue: number | null,
): ExecutiveKpiDeltaTone {
  if (percentDelta == null || !Number.isFinite(percentDelta)) return 'hidden';
  if (Math.abs(percentDelta) < 0.05) return 'neutral';
  if (semantics === 'neutral' || semantics === 'contextual') return 'neutral';
  const positive = percentDelta > 0;
  if (semantics === 'higher_is_better') return positive ? 'favorable' : 'unfavorable';
  if (semantics === 'lower_is_better') {
    if (rawValue === 0) return 'favorable';
    return positive ? 'unfavorable' : 'favorable';
  }
  return 'neutral';
}

interface KpiResolveInput {
  summary: EvaluationsAnalyticsSummaryResponse | null;
  lineage: EvaluationsLineageSummary | null;
  fetchPhase: EvaluationsMetricFetchPhase;
  fetchError: string | null;
  locale: 'de' | 'en';
  priorityOverrides?: Partial<Record<ExecutiveKpiId, number>>;
}

type MetricResolver = (input: KpiResolveInput) => {
  envelope: EvaluationsSectionEnvelope<unknown> | null | undefined;
  extractValue: (data: unknown) => number | null;
  formatValue: (v: number) => string;
  comparisonDisplay: string | null;
  absoluteDeltaDisplay: string | null;
  percentDelta: number | null;
  zeroMeansNull?: boolean;
};

const KPI_RESOLVERS: Record<ExecutiveKpiId, MetricResolver> = {
  revenue_mtd: ({ summary, locale }) => {
    const financial = summary?.financial;
    const data = financial?.data;
    const previous = data?.revenuePreviousMinor ?? null;
    const current = data?.revenueMtdMinor ?? null;
    const pct = data?.revenueDeltaPercent ?? safeDeltaPercent(current ?? 0, previous ?? 0);
    const abs =
      current != null && previous != null ? fmtDeltaMinor(current - previous, locale) : null;
    return {
      envelope: financial,
      extractValue: (d) => (d as { revenueMtdMinor?: number })?.revenueMtdMinor ?? null,
      formatValue: (v) => fmtEurMinor(v, locale),
      comparisonDisplay: previous != null ? fmtEurMinor(previous, locale) : null,
      absoluteDeltaDisplay: abs,
      percentDelta: pct,
    };
  },
  paid_revenue_mtd: ({ summary, locale }) => {
    const financial = summary?.financial;
    const data = financial?.data;
    const paid = data?.paidRevenueMtdMinor ?? null;
    const issued = data?.revenueMtdMinor ?? null;
    const pct =
      paid != null && issued != null && issued > 0 ? (paid / issued) * 100 : null;
    return {
      envelope: financial,
      extractValue: (d) => (d as { paidRevenueMtdMinor?: number })?.paidRevenueMtdMinor ?? null,
      formatValue: (v) => fmtEurMinor(v, locale),
      comparisonDisplay: issued != null ? fmtEurMinor(issued, locale) : null,
      absoluteDeltaDisplay: pct != null ? fmtPct(pct, 1) : null,
      percentDelta: null,
    };
  },
  contribution_margin: ({ summary, locale }) => {
    const financial = summary?.financial;
    const data = financial?.data;
    const current = data?.netMarginMinor ?? null;
    const previous =
      data != null ? data.revenuePreviousMinor - data.expensesPreviousMinor : null;
    const pct = current != null && previous != null ? safeDeltaPercent(current, previous) : null;
    const abs =
      current != null && previous != null ? fmtDeltaMinor(current - previous, locale) : null;
    return {
      envelope: financial,
      extractValue: (d) => (d as { netMarginMinor?: number })?.netMarginMinor ?? null,
      formatValue: (v) => fmtEurMinor(v, locale),
      comparisonDisplay: previous != null ? fmtEurMinor(previous, locale) : null,
      absoluteDeltaDisplay: abs,
      percentDelta: pct,
    };
  },
  fleet_utilization: ({ summary, locale }) => ({
    envelope: summary?.fleetUtilization,
    extractValue: (d) => (d as { utilizationPercent?: number | null })?.utilizationPercent ?? null,
    formatValue: (v) => fmtPct(v, 1),
    comparisonDisplay: null,
    absoluteDeltaDisplay: null,
    percentDelta: null,
  }),
  fleet_availability: ({ summary, locale }) => ({
    envelope: summary?.vehicleAvailability,
    extractValue: (d) => (d as { readyPercent?: number | null })?.readyPercent ?? null,
    formatValue: (v) => fmtPct(v, 1),
    comparisonDisplay: null,
    absoluteDeltaDisplay: null,
    percentDelta: null,
  }),
  unplanned_downtime: ({ summary, locale }) => ({
    envelope: summary?.downtime,
    extractValue: (d) => (d as { downtimePercent?: number | null })?.downtimePercent ?? null,
    formatValue: (v) => fmtPct(v, 1),
    comparisonDisplay: null,
    absoluteDeltaDisplay: null,
    percentDelta: null,
  }),
  financial_risk_exposure: ({ summary, locale }) => ({
    envelope: summary?.activeRisks,
    extractValue: (d) => (d as { estimatedExposureMinor?: number })?.estimatedExposureMinor ?? null,
    formatValue: (v) => fmtEurMinor(v, locale),
    comparisonDisplay: null,
    absoluteDeltaDisplay: null,
    percentDelta: null,
    zeroMeansNull: true,
  }),
  overdue_receivables: ({ summary, locale }) => ({
    envelope: summary?.receivables,
    extractValue: (d) => (d as { overdueAmountMinor?: number })?.overdueAmountMinor ?? null,
    formatValue: (v) => fmtEurMinor(v, locale),
    comparisonDisplay: null,
    absoluteDeltaDisplay: null,
    percentDelta: null,
    zeroMeansNull: true,
  }),
};

function resolveCard(
  definition: ExecutiveKpiDefinition,
  input: KpiResolveInput,
): ExecutiveKpiResolvedCard | null {
  const resolver = KPI_RESOLVERS[definition.id];
  const resolved = resolver(input);
  const state = resolveMetricFromEnvelope({
    envelope: resolved.envelope ?? null,
    extractValue: resolved.extractValue,
    formatValue: resolved.formatValue,
    fetchPhase: input.fetchPhase,
    fetchError: input.fetchError,
    locale: input.locale,
    zeroMeansNull: resolved.zeroMeansNull ?? definition.zeroMeansNull,
  });

  const lineageMetric = input.lineage
    ? lineageForMetric(input.lineage, definition.lineageMetricKey)
    : undefined;

  const deltaTone = resolveDeltaTone(definition.deltaSemantics, resolved.percentDelta, state.rawValue);

  return {
    id: definition.id,
    priority: definition.priority,
    drillDownSection: definition.drillDownSection,
    lineageMetricKey: definition.lineageMetricKey,
    state,
    valueUnit: definition.valueUnit,
    deltaSemantics: definition.deltaSemantics,
    periodLabel: input.summary?.period?.label ?? null,
    comparisonPeriodLabel: input.summary?.comparisonPeriod?.label ?? null,
    comparisonDisplay: resolved.comparisonDisplay,
    absoluteDeltaDisplay: resolved.absoluteDeltaDisplay,
    percentDelta: resolved.percentDelta,
    deltaTone,
    coveragePercent: lineageMetric?.dataCoverage.percent ?? null,
    freshnessState: lineageMetric?.freshness.state ?? resolved.envelope?.freshness?.stale ? 'STALE' : null,
    isEstimate: definition.isEstimate ?? false,
    isForecast: definition.isForecast ?? false,
  };
}

export function resolveExecutiveKpiStrip(input: KpiResolveInput): ExecutiveKpiStripResult {
  const registry = getExecutiveKpiRegistry(input.priorityOverrides)
    .slice()
    .sort((a, b) => a.priority - b.priority);

  const cards = registry
    .map((def) => resolveCard(def, input))
    .filter((c): c is ExecutiveKpiResolvedCard => c != null)
    .slice(0, EXECUTIVE_KPI_MAX_CARDS);

  return {
    cards,
    maxCards: EXECUTIVE_KPI_MAX_CARDS,
    periodLabel: input.summary?.period?.label ?? null,
    comparisonPeriodLabel: input.summary?.comparisonPeriod?.label ?? null,
  };
}

export function executiveKpiUnitLabel(unit: ExecutiveKpiValueUnit, locale: 'de' | 'en'): string {
  if (unit === 'currency_minor') return locale === 'en' ? 'EUR' : 'EUR';
  if (unit === 'percent') return '%';
  return locale === 'en' ? 'count' : 'Anzahl';
}

export function formatExecutiveKpiCoverage(
  percent: number | null,
  locale: 'de' | 'en',
): string | null {
  if (percent == null) return null;
  return locale === 'en' ? `${percent.toFixed(0)}% coverage` : `${percent.toFixed(0)}% Abdeckung`;
}

export function formatExecutiveKpiFreshness(
  state: ExecutiveKpiResolvedCard['freshnessState'],
  locale: 'de' | 'en',
): string | null {
  if (!state) return null;
  const mapDe: Record<string, string> = {
    FRESH: 'Aktuell',
    DELAYED: 'Verzögert',
    STALE: 'Veraltet',
    UNKNOWN: 'Unbekannt',
    FAILED: 'Fehlgeschlagen',
  };
  const mapEn: Record<string, string> = {
    FRESH: 'Fresh',
    DELAYED: 'Delayed',
    STALE: 'Stale',
    UNKNOWN: 'Unknown',
    FAILED: 'Failed',
  };
  return (locale === 'en' ? mapEn : mapDe)[state] ?? state;
}
