import {
  EVALUATIONS_ANALYTICS_SUMMARY_REQUIRED_KEYS,
  INSIGHT_ANALYTICS_SUMMARY_REQUIRED_KEYS,
  validateEvaluationsAnalyticsSummaryResponse,
  validateEvaluationsInsightDetail,
  validateEvaluationsInsightListResponse,
  validateInsightAnalyticsSummary,
} from './evaluations-analytics-contract-validation';
import type { EvaluationsMetricValue } from './evaluations-analytics-primitives.contract';

describe('evaluations-analytics-contract-validation', () => {
  it('validates insight analytics summary shape', () => {
    const result = validateInsightAnalyticsSummary({
      generatedAt: '2026-06-10T10:00:00.000Z',
      hasRun: true,
      lastRunAt: '2026-06-10T10:00:00.000Z',
      stale: false,
      error: null,
      counts: {
        totalVisible: 3,
        businessRisks: 2,
        revenueLeakage: 1,
        complianceRisks: 0,
        criticalInsights: 1,
        criticalBookings: 0,
        criticalBusinessRisks: 0,
        recommended: 1,
        bySeverity: { critical: 1, warning: 1, opportunity: 1, info: 0 },
        entities: {
          insightGroups: 3,
          events: 5,
          affectedVehicles: 2,
          affectedBookings: 1,
          affectedCustomers: 0,
          affectedStations: 1,
          uniqueEntities: 4,
          criticalBookings: 0,
          orgWideRisks: 1,
          bookingScopedRisks: 1,
        },
      },
      estimatedFinancialExposureMinor: 12000,
      estimatedFinancialExposureCurrency: 'EUR',
      appliedFilters: {},
    });
    expect(result.ok).toBe(true);
  });

  it('rejects insight summary with missing counts', () => {
    const result = validateInsightAnalyticsSummary({ generatedAt: null });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.path.startsWith('counts'))).toBe(true);
    }
  });

  it('validates insight detail and list responses', () => {
    const detail = validateEvaluationsInsightDetail({
      id: 'insight-1',
      type: 'STATION_SHORTAGE',
      severity: 'CRITICAL',
      priority: 90,
      title: 'Shortage',
      message: 'No vehicles',
      entityScope: 'STATION',
      isGrouped: false,
      groupCount: 1,
      createdAt: '2026-06-10T10:00:00.000Z',
    });
    expect(detail.ok).toBe(true);

    const list = validateEvaluationsInsightListResponse({
      data: [detail.ok ? detail.data : {}],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      appliedFilters: {
        period: { key: 'mtd', from: '2026-06-01', to: '2026-06-16', timezone: 'UTC' },
        comparisonPeriod: { key: 'mtd', from: '2026-05-01', to: '2026-05-31', timezone: 'UTC' },
        stationId: null,
        vehicleId: null,
        vehicleClassId: null,
        vehicleStatus: null,
        bookingStatus: null,
        customerSegment: null,
        currency: 'EUR',
        riskCategory: null,
        insightStatus: null,
        dataQualityStatus: null,
      },
    });
    expect(list.ok).toBe(true);
  });

  it('detects analytics summary schema drift via required keys', () => {
    expect(EVALUATIONS_ANALYTICS_SUMMARY_REQUIRED_KEYS).toContain('activeRisks');
    expect(EVALUATIONS_ANALYTICS_SUMMARY_REQUIRED_KEYS).toContain('costModel');
    expect(EVALUATIONS_ANALYTICS_SUMMARY_REQUIRED_KEYS).toContain('utilizationModel');
    expect(INSIGHT_ANALYTICS_SUMMARY_REQUIRED_KEYS).toContain('estimatedFinancialExposureMinor');

    const invalid = validateEvaluationsAnalyticsSummaryResponse({
      organizationId: 'org-1',
      generatedAt: '2026-06-10T10:00:00.000Z',
      overallStatus: 'OK',
      period: { key: 'mtd', label: 'MTD', from: '2026-06-01', to: '2026-06-16', timezone: 'UTC' },
      comparisonPeriod: {
        key: 'mtd',
        label: 'Prev',
        from: '2026-05-01',
        to: '2026-05-31',
        timezone: 'UTC',
      },
      metadata: { generationDurationMs: 10 },
    });
    expect(invalid.ok).toBe(false);
  });

  it('accepts discriminated metric value unions', () => {
    const money: EvaluationsMetricValue = {
      kind: 'money',
      value: { amountMinor: 1000, currency: 'EUR' },
    };
    const percent: EvaluationsMetricValue = { kind: 'percent', value: 12.5, decimals: 1 };
    expect(money.kind).toBe('money');
    expect(percent.kind).toBe('percent');
  });
});
