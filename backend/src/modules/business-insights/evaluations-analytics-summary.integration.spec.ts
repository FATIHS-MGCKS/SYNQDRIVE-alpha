/**
 * Integration-style test with realistic row counts and performance guard.
 */
import { Test } from '@nestjs/testing';
import { EvaluationsAnalyticsSummaryService } from './evaluations-analytics-summary.service';
import { EvaluationsAnalyticsSummaryRepository } from './evaluations-analytics-summary.repository';
import { DashboardInsightsAnalyticsService } from './dashboard-insights-analytics.service';

function buildFinancialSnapshot(scale: number) {
  return {
    revenueMtdMinor: 1_200_000 * scale,
    revenuePreviousMinor: 1_000_000 * scale,
    expensesMtdMinor: 350_000 * scale,
    expensesPreviousMinor: 300_000 * scale,
    paidRevenueMtdMinor: 1_100_000 * scale,
    openReceivablesMinor: 90_000 * scale,
    overdueReceivablesMinor: 15_000 * scale,
    openReceivablesCount: 40 * scale,
    overdueReceivablesCount: 6 * scale,
    currency: 'EUR',
  };
}

describe('EvaluationsAnalyticsSummaryService integration', () => {
  const orgId = 'org-scale-test';
  const vehicleCount = 120;
  const insightGroups = 45;

  const repository = {
    resolveOrgTimezone: jest.fn().mockResolvedValue('Europe/Berlin'),
    resolveStationVehicleIds: jest
      .fn()
      .mockResolvedValue(Array.from({ length: vehicleCount }, (_, i) => `veh-${i}`)),
    loadFinancialSnapshot: jest.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 8));
      return buildFinancialSnapshot(1);
    }),
    loadBookingSnapshot: jest.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 6));
      return {
        active: 28,
        pending: 12,
        completed: 840,
        revenueTodayMinor: 42_000,
        revenueMtdMinor: 1_150_000,
        revenuePreviousMinor: 980_000,
        currency: 'EUR',
      };
    }),
    loadFleetSnapshot: jest.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return {
        total: vehicleCount,
        available: 35,
        rented: 70,
        reserved: 10,
        maintenance: 3,
        blocked: 2,
        other: 0,
        cleaningRequired: 8,
        underutilized: 14,
      };
    }),
  };

  const insightsAnalytics = {
    getAnalyticsSummary: jest.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 12));
      return {
        generatedAt: '2026-06-10T10:00:00.000Z',
        hasRun: true,
        lastRunAt: '2026-06-10T10:00:00.000Z',
        stale: false,
        error: null,
        counts: {
          totalVisible: insightGroups,
          businessRisks: 18,
          revenueLeakage: 6,
          criticalInsights: 4,
          criticalBookings: 3,
          criticalBusinessRisks: 3,
          recommended: 20,
          bySeverity: { critical: 4, warning: 10, opportunity: 6, info: 25 },
          entities: {
            insightGroups,
            events: 180,
            affectedVehicles: 55,
            affectedBookings: 22,
            affectedCustomers: 0,
            affectedStations: 4,
            uniqueEntities: 81,
            criticalBookings: 3,
            orgWideRisks: 8,
            bookingScopedRisks: 37,
          },
        },
        estimatedFinancialExposureMinor: 240_000,
        estimatedFinancialExposureCurrency: 'EUR',
        appliedFilters: { stationId: 'station-a' },
      };
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

  it('composes full summary under performance budget with realistic fleet/insight counts', async () => {
    const started = Date.now();
    const result = await service.getSummary(orgId, {
      stationId: 'station-a',
      period: 'mtd',
    });
    const elapsed = Date.now() - started;

    expect(result.overallStatus).toBe('OK');
    expect(result.fleetUtilization.data?.totalOperational).toBe(115);
    expect(result.affectedEntities.data?.insightGroups).toBe(insightGroups);
    expect(result.comparisonPeriod.from).toBeTruthy();
    expect(result.metadata.generationDurationMs).toBeLessThan(500);
    expect(elapsed).toBeLessThan(500);
  });

  it('remains PARTIAL (not total failure) when insights source errors', async () => {
    insightsAnalytics.getAnalyticsSummary.mockRejectedValueOnce(new Error('insights unavailable'));

    const result = await service.getSummary(orgId);

    expect(result.activeRisks.status).toBe('ERROR');
    expect(result.financial.status).toBe('OK');
    expect(result.overallStatus).toBe('PARTIAL');
  });
});
