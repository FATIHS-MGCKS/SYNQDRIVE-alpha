import { Test } from '@nestjs/testing';
import { EvaluationsAnalyticsSummaryService } from './evaluations-analytics-summary.service';
import { EvaluationsAnalyticsSummaryRepository } from './evaluations-analytics-summary.repository';
import { DashboardInsightsAnalyticsService } from './dashboard-insights-analytics.service';

describe('EvaluationsAnalyticsSummaryService', () => {
  const orgId = 'org-eval-summary';

  const repository = {
    resolveOrgTimezone: jest.fn().mockResolvedValue('Europe/Berlin'),
    resolveStationVehicleIds: jest.fn().mockResolvedValue(['veh-1', 'veh-2']),
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
      appliedFilters: { stationId: null },
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
    const result = await service.getSummary(orgId, { period: 'mtd' });

    expect(result.organizationId).toBe(orgId);
    expect(result.overallStatus).toBe('OK');
    expect(result.executive.status).toBe('OK');
    expect(result.executive.data?.revenueMtdMinor).toBe(100_000);
    expect(result.financial.status).toBe('OK');
    expect(result.activeRisks.data?.criticalBookings).toBe(1);
    expect(result.affectedEntities.data?.affectedVehicles).toBe(4);
    expect(result.metadata.generationDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.insights.data?.stale).toBe(false);
  });

  it('applies station filter via repository scope', async () => {
    await service.getSummary(orgId, { stationId: 'station-1', period: 'last7d' });

    expect(repository.resolveStationVehicleIds).toHaveBeenCalledWith(orgId, 'station-1');
    expect(repository.loadFinancialSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ stationId: 'station-1', stationVehicleIds: ['veh-1', 'veh-2'] }),
      expect.any(Object),
      expect.any(Object),
    );
    expect(insightsAnalytics.getAnalyticsSummary).toHaveBeenCalledWith(orgId, {
      stationId: 'station-1',
    });
  });

  it('surfaces partial summary when financial section fails', async () => {
    repository.loadFinancialSnapshot.mockRejectedValueOnce(new Error('invoice db timeout'));

    const result = await service.getSummary(orgId);

    expect(result.financial.status).toBe('ERROR');
    expect(result.financial.data).toBeNull();
    expect(result.financial.error).toContain('invoice db timeout');
    expect(result.bookings.status).toBe('OK');
    expect(result.overallStatus).toBe('PARTIAL');
    expect(result.dataQuality.data?.unavailableSections).toContain('financial');
  });

  it('does not include customer or personal fields in executive payload', async () => {
    const result = await service.getSummary(orgId);
    const serialized = JSON.stringify(result.executive.data ?? {});
    expect(serialized).not.toMatch(/customer/i);
    expect(serialized).not.toMatch(/email/i);
    expect(serialized).not.toMatch(/firstName/i);
  });
});
