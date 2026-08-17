import type { EvaluationsPeriodWindow } from '@synq/evaluations-periods/evaluations-period.contract';
import type { EvaluationsMetricResponse } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { EvaluationsAnalyticsInsightsSummary } from '../../e4/contracts/evaluations-insights.contract';
import type { EvaluationsQualityReport } from '../../e5/contracts/evaluations-quality.contract';
import type { E7RecommendationScope } from '@synq/evaluations-recommendations/evaluations-recommendations.contract';
import { E7_FINANCE_METRIC_OPEN, E7_FINANCE_METRIC_OVERDUE } from './evaluations-recommendations.derive';

export const E7_FIXTURE_MTD_PERIOD: EvaluationsPeriodWindow = {
  periodType: 'MTD',
  start: '2026-02-01T00:00:00.000Z',
  endExclusive: '2026-03-01T00:00:00.000Z',
  reference: '2026-02-15T00:00:00.000Z',
  timezone: {
    effectiveTimezone: 'Europe/Berlin',
    source: 'ORGANIZATION',
    reportTimezone: null,
    stationTimezone: null,
    organizationTimezone: 'Europe/Berlin',
  },
  comparisonBasis: null,
};

export const E7_FIXTURE_ANALYTICS_PERIOD: EvaluationsPeriodWindow = {
  ...E7_FIXTURE_MTD_PERIOD,
  periodType: 'MONTH',
  start: '2026-01-01T00:00:00.000Z',
  endExclusive: '2026-02-01T00:00:00.000Z',
  reference: '2026-01-31T00:00:00.000Z',
};

export const E7_FIXTURE_SCOPE: E7RecommendationScope = {
  organizationId: 'org-a',
  stationIds: null,
  stationScoped: false,
};

export function e7PercentMetric(
  metricId: string,
  value: number | null,
  period: EvaluationsPeriodWindow,
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'PARTIAL' = 'AVAILABLE',
): EvaluationsMetricResponse {
  return {
    schemaVersion: '1.0.0',
    metricId,
    metricKind: 'OBSERVED',
    generatedAt: '2026-02-15T00:00:00.000Z',
    period,
    comparison: null,
    dataCoverage: null,
    sourceFreshness: null,
    calculationVersion: '1.0.0',
    exclusions: [],
    warnings: [],
    valueType: 'PERCENT',
    unit: 'PERCENT',
    status,
    value: status === 'AVAILABLE' || status === 'PARTIAL' ? value : null,
  } as EvaluationsMetricResponse;
}

export function e7MoneyMetric(
  metricId: string,
  amountMinor: number,
  currency: string,
  period: EvaluationsPeriodWindow,
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'PARTIAL' = 'AVAILABLE',
): EvaluationsMetricResponse {
  return {
    schemaVersion: '1.0.0',
    metricId,
    metricKind: 'OBSERVED',
    generatedAt: '2026-02-15T00:00:00.000Z',
    period,
    comparison: null,
    dataCoverage: null,
    sourceFreshness: null,
    calculationVersion: '1.0.0',
    exclusions: [],
    warnings: [],
    valueType: 'MONEY',
    unit: 'CURRENCY_MINOR',
    status,
    value: status === 'AVAILABLE' || status === 'PARTIAL' ? { amountMinor, currency } : null,
  } as EvaluationsMetricResponse;
}

export function e7BaseSummary(
  overrides: {
    sections?: Partial<EvaluationsAnalyticsInsightsSummary['sections']>;
  } & Partial<Omit<EvaluationsAnalyticsInsightsSummary, 'sections'>> = {},
): EvaluationsAnalyticsInsightsSummary {
  const mtd = E7_FIXTURE_MTD_PERIOD;
  const analytics = E7_FIXTURE_ANALYTICS_PERIOD;
  const base: EvaluationsAnalyticsInsightsSummary = {
    schemaVersion: '1.0.0',
    generatedAt: '2026-02-15T00:00:00.000Z',
    scope: E7_FIXTURE_SCOPE,
    period: analytics,
    calculationVersion: 'analytics-summary-e4-v1',
    sections: {
      finance: {
        status: 'AVAILABLE',
        metrics: {
          [E7_FINANCE_METRIC_OVERDUE]: e7MoneyMetric(E7_FINANCE_METRIC_OVERDUE, 0, 'EUR', mtd),
          [E7_FINANCE_METRIC_OPEN]: e7MoneyMetric(E7_FINANCE_METRIC_OPEN, 0, 'EUR', mtd),
        },
        reason: null,
      },
      costModel: {
        status: 'AVAILABLE',
        calculationVersion: 'cost-model-e4-v2',
        period: analytics,
        scope: E7_FIXTURE_SCOPE,
        coverage: null,
        generatedAt: '2026-02-15T00:00:00.000Z',
        reason: null,
        categories: [],
        totalsByCurrency: [],
        reportingCurrency: 'EUR',
        mixedCurrency: false,
      },
      utilization: {
        status: 'PARTIAL',
        calculationVersion: 'utilization-model-e4-v2',
        period: analytics,
        scope: E7_FIXTURE_SCOPE,
        coverage: null,
        generatedAt: '2026-02-15T00:00:00.000Z',
        reason: null,
        utilizationPercent: e7PercentMetric('ops.fleet_utilization_pct', 35, analytics, 'AVAILABLE'),
        occupancyBasis: 'SCHEDULED',
        capacityMs: null,
        rentedMs: null,
        maintenanceMs: null,
        blockedMs: null,
        netCapacityMs: null,
        eligibleVehicles: null,
        overlappingBookingPairs: null,
        telemetryOfflineVehicles: null,
        telemetrySnapshotAsOf: null,
      },
      strengths: {
        status: 'AVAILABLE',
        calculationVersion: 'strength-detection-e4-v3',
        period: analytics,
        scope: E7_FIXTURE_SCOPE,
        coverage: null,
        generatedAt: '2026-02-15T00:00:00.000Z',
        reason: null,
        strengths: [],
        evaluatedDimensions: ['BOOKINGS'],
        skippedDimensions: [],
      },
      weaknesses: {
        status: 'AVAILABLE',
        calculationVersion: 'weakness-detection-e4-v3',
        period: analytics,
        scope: E7_FIXTURE_SCOPE,
        coverage: null,
        generatedAt: '2026-02-15T00:00:00.000Z',
        reason: null,
        weaknesses: [],
        evaluatedDimensions: ['BOOKINGS'],
        skippedDimensions: [],
      },
      driverInfluence: {
        status: 'UNAVAILABLE',
        calculationVersion: 'driver-influence-e4-v1',
        period: analytics,
        scope: E7_FIXTURE_SCOPE,
        coverage: null,
        generatedAt: '2026-02-15T00:00:00.000Z',
        reason: 'PERSON_LEVEL_ACCESS_DENIED',
        disclaimer: 'association only',
        confounders: [],
        factors: [],
        piiTier: 'none',
      },
    },
  };
  return {
    ...base,
    ...overrides,
    sections: { ...base.sections, ...overrides.sections },
  };
}

export function e7BaseQuality(overrides: Partial<EvaluationsQualityReport> = {}): EvaluationsQualityReport {
  const dims = {
    FRESHNESS: 'UNKNOWN' as const,
    COMPLETENESS: 'COMPLETE' as const,
    PROVENANCE: 'COMPLETE' as const,
    VALIDITY: 'UNKNOWN' as const,
    TEMPORAL_APPLICABILITY: 'COMPLETE' as const,
  };
  return {
    schemaVersion: '1.0.0',
    generatedAt: '2026-02-15T00:00:00.000Z',
    scope: E7_FIXTURE_SCOPE,
    period: E7_FIXTURE_ANALYTICS_PERIOD,
    calculationVersion: 'evaluations-quality-e5-v2',
    sections: [
      {
        section: 'finance',
        status: 'AVAILABLE',
        dimensions: dims,
        freshness: null,
        businessEventRecency: null,
        coverage: null,
        requiredSourceClasses: ['FINANCE_INVOICE'],
        lineage: [],
        reason: null,
      },
    ],
    overall: { status: 'AVAILABLE', complete: false, reason: 'QUALITY_INCOMPLETE' },
    ...overrides,
  };
}
