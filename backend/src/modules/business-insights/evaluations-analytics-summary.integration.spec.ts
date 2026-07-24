/**
 * Integration-style test with realistic row counts and performance guard.
 */
import { Test } from '@nestjs/testing';
import { EvaluationsAnalyticsSummaryService } from './evaluations-analytics-summary.service';
import { EvaluationsUtilizationSnapshotService } from './evaluations-utilization-snapshot.service';
import { EvaluationsStrengthDetectionService } from './evaluations-strength-detection.service';
import { EvaluationsWeaknessDetectionService } from './evaluations-weakness-detection.service';
import { EvaluationsDriverAnalysisService } from './evaluations-driver-analysis.service';
import { EvaluationsAnalyticsSummaryRepository } from './evaluations-analytics-summary.repository';
import { DashboardInsightsAnalyticsService } from './dashboard-insights-analytics.service';
import type { ResolvedEvaluationsAnalyticsFilters } from '@synq/evaluations-insights/evaluations-analytics-filters.contract';

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
    allowedStationIds: null,
    ...overrides,
  });

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
    loadCostModelSnapshot: jest.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 7));
      return {
        currency: 'EUR',
        invoiceExpensesMinor: 350_000,
        invoiceExpenseCount: 120,
        invoicesWithVehicleIdCount: 95,
        vendorCategoryExpenses: { WORKSHOP: 120_000 },
        damageRepairCostsMinor: 25_000,
        damagesWithRepairCostCount: 8,
        damagesTotalInPeriod: 12,
        serviceCaseCostsMinor: 40_000,
        unplannedRepairCostsMinor: 22_000,
        serviceCasesWithActualCostCount: 15,
        serviceCasesTotalInPeriod: 20,
        serviceEventCostsMinor: 12_000,
        serviceEventsWithCostCount: 10,
        serviceEventsTotalInPeriod: 18,
        estimatedFixedCostsMinor: 80_000,
        vehiclesWithFixedCostData: 90,
        vehicleCount,
        completedBookingsInPeriod: 840,
        cancelledBookingsInPeriod: 22,
        noShowBookingsInPeriod: 5,
        totalKmDriven: 420_000,
        bookingsWithKmCount: 780,
        totalRentalDays: 2_100,
        bookingsWithRentalDaysCount: 820,
        expensesByStation: [],
        expensesByVehicleClass: [],
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
          complianceRisks: 2,
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

  const utilizationSnapshot = {
    loadSnapshot: jest.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 6));
      return {
        periodFromMs: Date.parse('2026-06-01T00:00:00.000Z'),
        periodToMs: Date.parse('2026-06-16T12:00:00.000Z'),
        vehicles: Array.from({ length: vehicleCount }, (_, i) => ({
          vehicleId: `veh-${i}`,
          label: `V-${i}`,
          homeStationId: 'station-a',
          homeStationName: 'Station A',
          vehicleClassId: 'cls-1',
          vehicleClassName: 'Compact',
          prismaStatus: 'AVAILABLE',
          cleaningStatus: 'CLEAN',
          rentalBlocked: false,
          telemetryOffline: i % 10 === 0,
          operationalToken: i % 3 === 0 ? 'ACTIVE_RENTED' : 'AVAILABLE',
          capacityMs: 1_000_000,
          rentedMs: 400_000,
          maintenanceMs: 10_000,
          blockedMs: 5_000,
          unplannedDowntimeMs: 2_000,
          bookedNotRealizedMs: 20_000,
          standstillMs: 585_000,
          turnaroundMs: 8_000,
          turnaroundCount: 1,
        })),
        overlappingBookingIds: [],
        stationBottlenecks: [],
        operationalSnapshot: {
          activeRented: 40,
          reserved: 10,
          available: 60,
          maintenance: 5,
          blocked: 5,
          unknown: 0,
          operationalUtilizationPercent: 40,
        },
        maintenanceFromDowntimeWindows: 20,
        maintenanceFromSnapshotOnly: 3,
        blockedFromDowntimeWindows: 2,
        blockedFromSnapshotOnly: 1,
      };
    }),
  };

  let service: EvaluationsAnalyticsSummaryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        EvaluationsAnalyticsSummaryService,
        EvaluationsStrengthDetectionService,
        EvaluationsWeaknessDetectionService,
        EvaluationsDriverAnalysisService,
        { provide: EvaluationsAnalyticsSummaryRepository, useValue: repository },
        { provide: DashboardInsightsAnalyticsService, useValue: insightsAnalytics },
        { provide: EvaluationsUtilizationSnapshotService, useValue: utilizationSnapshot },
      ],
    }).compile();
    service = moduleRef.get(EvaluationsAnalyticsSummaryService);
  });

  it('composes full summary under performance budget with realistic fleet/insight counts', async () => {
    const started = Date.now();
    const result = await service.getSummary(
      orgId,
      baseResolved({ stationId: 'station-a' }),
    );
    const elapsed = Date.now() - started;

    expect(result.overallStatus).toBe('PARTIAL');
    expect(result.fleetUtilization.data?.totalOperational).toBe(115);
    expect(result.affectedEntities.data?.insightGroups).toBe(insightGroups);
    expect(result.costModel.data?.metrics.length).toBeGreaterThan(10);
    expect(result.utilizationModel.data?.drillDowns.length).toBeGreaterThan(3);
    expect(result.comparisonPeriod.from).toBeTruthy();
    expect(result.metadata.generationDurationMs).toBeLessThan(500);
    expect(elapsed).toBeLessThan(500);
  });

  it('remains PARTIAL (not total failure) when insights source errors', async () => {
    insightsAnalytics.getAnalyticsSummary.mockRejectedValueOnce(new Error('insights unavailable'));

    const result = await service.getSummary(orgId, baseResolved());

    expect(result.activeRisks.status).toBe('ERROR');
    expect(result.financial.status).toBe('OK');
    expect(result.overallStatus).toBe('PARTIAL');
  });
});
