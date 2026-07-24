/**
 * Canonical Auswertungen analytics primitives (Prompt 20/54).
 * Shared by backend responses, frontend consumers, and OpenAPI documentation.
 * No PII fields.
 */
import type { InsightEntityReference } from './insight-entity-references.contract';
import type { EvaluationsAnalyticsAppliedFilters } from './evaluations-analytics-filters.contract';

/** Section / metric availability — not insight severity. */
export type EvaluationsMetricStatus = 'OK' | 'PARTIAL' | 'UNAVAILABLE' | 'ERROR';

/** ISO 4217 currency code + minor units (cents). */
export interface EvaluationsMoney {
  amountMinor: number;
  currency: string;
}

export type EvaluationsMetricValue =
  | { kind: 'count'; value: number; unit?: string | null }
  | { kind: 'money'; value: EvaluationsMoney }
  | { kind: 'percent'; value: number; decimals?: number }
  | { kind: 'ratio'; numerator: number; denominator: number; percent: number | null }
  | { kind: 'duration'; valueMs: number; label?: string | null }
  | { kind: 'text'; value: string };

export interface EvaluationsTimePeriod {
  key: string;
  label: string;
  from: string;
  to: string;
  timezone: string;
}

export interface EvaluationsComparison {
  current: EvaluationsTimePeriod;
  previous: EvaluationsTimePeriod;
  deltaPercent: number | null;
}

export interface EvaluationsTimeSeriesPoint {
  at: string;
  value: EvaluationsMetricValue;
}

export interface EvaluationsTimeSeries {
  metricKey: string;
  label: string;
  period: EvaluationsTimePeriod;
  points: EvaluationsTimeSeriesPoint[];
}

export interface EvaluationsRankingItem {
  rank: number;
  entityType: 'VEHICLE' | 'BOOKING' | 'CUSTOMER' | 'STATION' | 'INVOICE' | 'INSIGHT';
  entityId: string;
  label: string;
  metric: EvaluationsMetricValue;
}

export interface EvaluationsRanking {
  metricKey: string;
  label: string;
  period: EvaluationsTimePeriod;
  items: EvaluationsRankingItem[];
}

export type EvaluationsRiskSeverity = 'CRITICAL' | 'WARNING' | 'OPPORTUNITY' | 'INFO';

export interface EvaluationsRisk {
  id: string;
  category: 'BUSINESS_RISK' | 'REVENUE_LEAKAGE' | 'OPERATIONAL_RECOMMENDATION';
  severity: EvaluationsRiskSeverity;
  title: string;
  exposure: EvaluationsMoney | null;
  entityReferences: InsightEntityReference[];
  groupCount: number;
}

export interface EvaluationsStrength {
  code: string;
  label: string;
  metric: EvaluationsMetricValue | null;
}

export interface EvaluationsWeakness {
  code: string;
  label: string;
  metric: EvaluationsMetricValue | null;
}

export interface EvaluationsRecommendation {
  id: string;
  sourceInsightId: string | null;
  title: string;
  message: string;
  priority: number;
  actionType: string | null;
  actionLabel: string | null;
}

export type EvaluationsForecast =
  | {
      kind: 'point';
      at: string;
      metric: EvaluationsMetricValue;
      confidence: number | null;
    }
  | {
      kind: 'band';
      from: string;
      to: string;
      expected: EvaluationsMetricValue;
      lower: EvaluationsMetricValue;
      upper: EvaluationsMetricValue;
      confidence: number | null;
    }
  | { kind: 'unavailable'; reason: string };

export interface EvaluationsDataQuality {
  overallStatus: EvaluationsMetricStatus;
  insightsStale: boolean;
  insightsLastRunAt: string | null;
  invoiceDataComplete: boolean;
  fleetDataComplete: boolean;
  partialSections: string[];
  unavailableSections: string[];
}

/** Alias — canonical entity reference for analytics surfaces. */
export type EvaluationsEntityReference = InsightEntityReference;

export type EvaluationsDrillDownKind = 'entity_list' | 'metric_breakdown' | 'time_series' | 'ranking';

export interface EvaluationsDrillDownResult {
  kind: EvaluationsDrillDownKind;
  title: string;
  appliedFilters: EvaluationsAnalyticsAppliedFilters;
  generatedAt: string;
  status: EvaluationsMetricStatus;
  error: string | null;
  entityList?: Array<{
    entityType: EvaluationsRankingItem['entityType'];
    entityId: string;
    label: string;
    metrics: Record<string, EvaluationsMetricValue>;
  }>;
  timeSeries?: EvaluationsTimeSeries;
  ranking?: EvaluationsRanking;
  metricBreakdown?: Record<string, EvaluationsMetricValue>;
}

export interface EvaluationsPaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface EvaluationsSectionEnvelope<T> {
  status: EvaluationsMetricStatus;
  data: T | null;
  error: string | null;
  generatedAt: string;
  freshness?: {
    stale: boolean;
    lastUpdatedAt?: string | null;
  };
}
