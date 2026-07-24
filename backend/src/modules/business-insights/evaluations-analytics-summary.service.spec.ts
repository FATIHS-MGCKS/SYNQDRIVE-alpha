import { Test } from '@nestjs/testing';
import { EvaluationsAnalyticsSummaryService } from './evaluations-analytics-summary.service';
import { EvaluationsAnalyticsSummaryRepository } from './evaluations-analytics-summary.repository';
import { DashboardInsightsAnalyticsService } from './dashboard-insights-analytics.service';
import type { ResolvedEvaluationsAnalyticsFilters } from '@synq/evaluations-insights/evaluations-analytics-filters.contract';

describe('EvaluationsAnalyticsSummaryService', () => {
  const orgId = 'org-eval-summary';

  const baseResolved = (
    overrides: Partial<ResolvedEvaluationsAnalyticsFilters> = {},
  ): ResolvedEvaluationsAnalyticsFilters => ({
    organizationId: orgId,
    period: {
      key: 'mtd',
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-16T12:00:00.000Z',
      timezone: 'Europe/Berlin',
    },
    comparisonPeriod: {
      key: 'mtd',
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-05-31T23:59:59.999Z',
      timezone: 'Europe/Berlin',
    },
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
    scopedVehicleIds: null,
    stationVehicleIds: null,
    ...overrides,
  });

  const repository = {
    loadFinancialSnapshot: jest.fn().mockResolvedValue({
      revenueMtdMinor: 100_000,
      revenuePreviousMinor: 80_000,
      expensesMtdMinor: 30_000,
      expensesPreviousMinor: 25_000,
      paidRevenueMtdMinor: 90_000,
      openReceivablesMinor: 12_000,
      overdueReceivablesMinor: 4_000,
      openReceivablesCount: 2,
      overdueReceivablesCount: 1,
      currency: 'EUR',
    }),
    loadBookingSnapshot: jest.fn().mockResolvedValue({
      active: 3,
      pending: 1,
      completed: 40,
      revenueTodayMinor: 5_000,
      revenueMtdMinor: 95_000,
      revenuePreviousMinor: 70_000,
      currency: 'EUR',
    }),
    loadFleetSnapshot: jest.fn().mockResolvedValue({
      total: 10,
      available: 4,
      rented: 5,
      reserved: 1,
      maintenance: 0,
      blocked: 0,
      other: 0,
      cleaningRequired: 1,
      underutilized: 2,
    }),
  };

  const insightsAnalytics = {
    getAnalyticsSummary: jest.fn().mockResolvedValue({
      generatedAt: '2026-06-10T10:00:00.000Z',
      hasRun: true,
      lastRunAt: '2026-06-10T10:00:00.000Z',
      stale: false,
      error: null,
      counts: {
        totalVisible: 5,
        businessRisks: 2,
        revenueLeakage: 1,
        criticalInsights: 1,
        criticalBookings: 1,
        criticalBusinessRisks: 1,
        recommended: 3,
        bySeverity: { critical: 1, warning: 2, opportunity: 1, info: 1 },
        entities: {
          insightGroups: 5,
          events: 8,
          affectedVehicles: 4,
          affectedBookings: 2,
          affectedCustomers: 0,
          affectedStations: 1,
          uniqueEntities: 7,
          criticalBookings: 1,
          orgWideRisks: 1,
          bookingScopedRisks: 4,
        },
      },
      estimatedFinancialExposureMinor: 25_000,
      estimatedFinancialExposureCurrency: 'EUR',
      appliedFilters: {},
    }),
  };

  let service: EvaluationsAnalyticsSummaryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        EvaluationsAnalyticsSummaryService,
        { provide: EvaluationsAnalyticsSummaryRepository, useValue: repository },
        { provide: DashboardInsightsAnalyticsService, useValue: insightsAnalytics },
      ],
    }).compile();
    service = moduleRef.get(EvaluationsAnalyticsSummaryService);
  });

  it('returns canonical summary with all major sections OK', async () => {
    const result = await service.getSummary(orgId, baseResolved());

    expect(result.organizationId).toBe(orgId);
    expect(result.overallStatus).toBe('OK');
    expect(result.executive.data?.revenueMtdMinor).toBe(100_000);
    expect(result.appliedFilters.stationId).toBeNull();
  });

  it('passes resolved filters to repository loaders', async () => {
    const resolved = baseResolved({ stationId: 'station-1' });
    await service.getSummary(orgId, resolved);

    expect(repository.loadFinancialSnapshot).toHaveBeenCalledWith(resolved);
    expect(repository.loadBookingSnapshot).toHaveBeenCalledWith(resolved);
    expect(insightsAnalytics.getAnalyticsSummary).toHaveBeenCalledWith(orgId, resolved);
  });

  it('surfaces partial summary when financial section fails', async () => {
    repository.loadFinancialSnapshot.mockRejectedValueOnce(new Error('invoice db timeout'));

    const result = await service.getSummary(orgId, baseResolved());

    expect(result.financial.status).toBe('ERROR');
    expect(result.bookings.status).toBe('OK');
    expect(result.overallStatus).toBe('PARTIAL');
  });
});
