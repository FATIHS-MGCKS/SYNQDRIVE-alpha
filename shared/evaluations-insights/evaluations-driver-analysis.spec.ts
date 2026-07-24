import {
  attachDriverAnalysisToStrengths,
  attachDriverAnalysisToWeaknesses,
  buildDriverAnalysisSnapshot,
  buildDriverAnalysisSummary,
  driverAnalysisSectionStatus,
} from './evaluations-driver-analysis';
import { EVALUATIONS_DRIVER_ANALYSIS_VERSION } from './evaluations-driver-analysis.contract';
import type { EvaluationsDetectedStrength } from './evaluations-strength-detection.contract';
import type { EvaluationsDetectedWeakness } from './evaluations-weakness-detection.contract';

const period = {
  key: 'mtd',
  label: 'Month to date',
  from: '2026-06-01T00:00:00.000Z',
  to: '2026-06-16T12:00:00.000Z',
  timezone: 'Europe/Berlin',
};

const comparisonPeriod = {
  key: 'mtd',
  label: 'Previous mtd',
  from: '2026-05-01T00:00:00.000Z',
  to: '2026-05-31T23:59:59.999Z',
  timezone: 'Europe/Berlin',
};

function baseSnapshot() {
  return buildDriverAnalysisSnapshot({
    period,
    comparisonPeriod,
    currency: 'EUR',
    financial: {
      revenueCurrentMinor: 120_000,
      revenuePreviousMinor: 160_000,
      expensesCurrentMinor: 110_000,
      expensesPreviousMinor: 90_000,
      openReceivablesMinor: 25_000,
      overdueReceivablesMinor: 10_000,
      openReceivablesCount: 5,
      overdueReceivablesCount: 2,
    },
    bookings: { completedInPeriod: 35, cancelledInPeriod: 6, noShowInPeriod: 3 },
    fleet: { total: 12, underutilized: 4, maintenance: 2, blocked: 1 },
    utilizationModel: {
      calculationVersion: 'utilization-model-v1',
      period,
      totals: {
        periodMs: 1_000_000,
        fleetCapacityMs: 2_000_000,
        rentedMs: 600_000,
        availableMs: 1_300_000,
        maintenanceMs: 50_000,
        blockedMs: 50_000,
        unplannedDowntimeMs: 200_000,
        turnaroundMs: 80_000,
        standstillMs: 0,
        bookedNotRealizedMs: 0,
        availableNotRentableCount: 0,
        capacityBottleneckStations: 1,
        overlappingBookingCount: 0,
        telemetryOfflineCount: 0,
      },
      operationalSnapshot: {
        activeRented: 5,
        reserved: 1,
        available: 4,
        maintenance: 1,
        blocked: 1,
        unknown: 0,
        operationalUtilizationPercent: 45,
      },
      metrics: [
        {
          key: 'UTILIZATION_PER_VEHICLE',
          label: 'Utilization',
          formula: 'rented/capacity',
          dataSources: ['bookings'],
          coverage: {
            numeratorMs: 600_000,
            denominatorMs: 2_000_000,
            vehicleCount: 12,
            vehiclesWithData: 10,
            percent: 83,
          },
          period,
          status: 'OK',
          calculationVersion: 'utilization-model-v1',
          valueMs: null,
          valuePercent: 35,
          unit: 'percent',
        },
        {
          key: 'UTILIZATION_BY_STATION',
          label: 'By station',
          formula: 'rented/capacity',
          dataSources: ['bookings'],
          coverage: {
            numeratorMs: 0,
            denominatorMs: 0,
            vehicleCount: 12,
            vehiclesWithData: 10,
            percent: null,
          },
          period,
          status: 'OK',
          calculationVersion: 'utilization-model-v1',
          valueMs: null,
          valuePercent: null,
          unit: 'percent',
          breakdown: [
            {
              dimension: 'STATION',
              key: 'st-1',
              label: 'Berlin',
              rentedMs: 100_000,
              capacityMs: 500_000,
              utilizationPercent: 22,
              vehicleCount: 5,
            },
            {
              dimension: 'STATION',
              key: 'st-2',
              label: 'Munich',
              rentedMs: 400_000,
              capacityMs: 500_000,
              utilizationPercent: 48,
              vehicleCount: 4,
            },
          ],
        },
      ],
      drillDowns: [],
      dataGaps: [],
    },
    utilizationSnapshot: {
      periodFromMs: 0,
      periodToMs: 1,
      vehicles: [
        {
          vehicleId: 'v1',
          label: 'AB-1',
          homeStationId: 'st-1',
          homeStationName: 'Berlin',
          vehicleClassId: null,
          vehicleClassName: null,
          prismaStatus: 'AVAILABLE',
          cleaningStatus: 'CLEAN',
          rentalBlocked: false,
          telemetryOffline: false,
          operationalToken: 'AVAILABLE',
          capacityMs: 1_000_000,
          rentedMs: 100_000,
          maintenanceMs: 0,
          blockedMs: 0,
          unplannedDowntimeMs: 200_000,
          bookedNotRealizedMs: 0,
          standstillMs: 700_000,
          turnaroundMs: 0,
          turnaroundCount: 0,
        },
      ],
      overlappingBookingIds: [],
      stationBottlenecks: [
        {
          stationId: 'st-1',
          stationName: 'Berlin',
          totalVehicles: 5,
          bookedVehicles: 5,
          availableVehicles: 0,
        },
      ],
      operationalSnapshot: {
        activeRented: 0,
        reserved: 0,
        available: 1,
        maintenance: 0,
        blocked: 0,
        unknown: 0,
        operationalUtilizationPercent: 0,
      },
      maintenanceFromDowntimeWindows: 0,
      maintenanceFromSnapshotOnly: 0,
      blockedFromDowntimeWindows: 0,
      blockedFromSnapshotOnly: 0,
    },
    costModelSnapshot: {
      currency: 'EUR',
      invoiceExpensesMinor: 110_000,
      invoiceExpenseCount: 8,
      invoicesWithVehicleIdCount: 6,
      vendorCategoryExpenses: { WORKSHOP: 50_000, TOWING: 15_000 },
      damageRepairCostsMinor: 12_000,
      damagesWithRepairCostCount: 2,
      damagesTotalInPeriod: 2,
      serviceCaseCostsMinor: 20_000,
      unplannedRepairCostsMinor: 18_000,
      serviceCasesWithActualCostCount: 2,
      serviceCasesTotalInPeriod: 3,
      serviceEventCostsMinor: 5_000,
      serviceEventsWithCostCount: 1,
      serviceEventsTotalInPeriod: 2,
      estimatedFixedCostsMinor: 8_000,
      vehiclesWithFixedCostData: 8,
      vehicleCount: 8,
      completedBookingsInPeriod: 35,
      cancelledBookingsInPeriod: 6,
      noShowBookingsInPeriod: 3,
      totalKmDriven: 5000,
      bookingsWithKmCount: 30,
      totalRentalDays: 40,
      bookingsWithRentalDaysCount: 32,
      expensesByStation: [
        { stationId: 'st-1', stationName: 'Berlin', expensesMinor: 70_000, vehicleCount: 5 },
      ],
      expensesByVehicleClass: [
        { vehicleClassId: 'cls-1', vehicleClassName: 'Compact', expensesMinor: 60_000, vehicleCount: 6 },
      ],
    },
    insights: {
      businessRiskGroups: 3,
      revenueLeakageGroups: 1,
      complianceInsightGroups: 2,
      criticalInsights: 1,
      affectedVehicles: 4,
      affectedStations: 2,
      affectedBookings: 1,
      estimatedExposureMinor: 12_000,
      exposureCurrency: 'EUR',
    },
    dataQuality: {
      overallStatus: 'OK',
      partialSectionCount: 0,
      unavailableSectionCount: 0,
      hasOverlappingBookings: false,
      insightsStale: false,
      partialSections: [],
    },
  });
}

describe('evaluations-driver-analysis (shared)', () => {
  it('builds driver analysis with disclaimer and traceable factors', () => {
    const snapshot = baseSnapshot();
    const weaknesses: EvaluationsDetectedWeakness[] = [
      {
        id: 'UNDERUTILIZATION',
        category: 'UTILIZATION',
        severity: 'WARNING',
        title: 'Fleet underutilization',
        description: 'Low utilization',
        underlyingKpis: ['utilizationModel.metrics.UTILIZATION_PER_VEHICLE'],
        quantitativeDeviation: {
          value: 35,
          unit: 'percent',
          direction: 'worse',
          label: '35%',
          kind: 'OBSERVATION',
        },
        period,
        comparisonBasis: 'ORG_TARGET',
        affectedEntities: {
          entityType: 'FLEET',
          vehicles: 12,
          stations: 0,
          bookings: 0,
          insightGroups: 0,
        },
        financialImpact: null,
        confidence: 'MEDIUM',
        dataCoverage: { numerator: 10, denominator: 12, percent: 83 },
        recommendedNextAnalysis: 'Drill down',
        priority: 100,
      },
      {
        id: 'RISING_COSTS',
        category: 'COST',
        severity: 'WARNING',
        title: 'Rising costs',
        description: 'Costs up',
        underlyingKpis: ['financial.expensesMtdMinor'],
        quantitativeDeviation: {
          value: 22,
          unit: 'percent',
          direction: 'worse',
          label: '+22%',
          kind: 'OBSERVATION',
        },
        period,
        comparisonBasis: 'HISTORICAL_PERIOD',
        affectedEntities: {
          entityType: 'ORG',
          vehicles: 0,
          stations: 0,
          bookings: 0,
          insightGroups: 0,
        },
        financialImpact: null,
        confidence: 'HIGH',
        dataCoverage: { numerator: 1, denominator: 1, percent: 100 },
        recommendedNextAnalysis: 'Review cost model',
        priority: 50,
      },
    ];

    const summary = buildDriverAnalysisSummary({
      snapshot,
      strengths: [],
      weaknesses,
      activeRisks: {
        businessRiskGroups: 3,
        revenueLeakageGroups: 1,
        complianceInsightGroups: 2,
        criticalInsights: 1,
        criticalBookings: 1,
        estimatedExposureMinor: 12_000,
        exposureCurrency: 'EUR',
        orgWideRisks: 1,
        bookingScopedRisks: 2,
      },
    });

    expect(summary.calculationVersion).toBe(EVALUATIONS_DRIVER_ANALYSIS_VERSION);
    expect(summary.disclaimer).toContain('Correlation is not causation');
    expect(summary.weaknessDrivers.length).toBe(2);
    expect(summary.riskDrivers.length).toBeGreaterThan(0);

    const underutil = summary.weaknessDrivers.find((d) => d.weaknessId === 'UNDERUTILIZATION');
    expect(underutil?.driverAnalysis.primaryFactors.length).toBeGreaterThan(0);
    expect(underutil?.driverAnalysis.affectedStations.some((s) => s.entityId === 'st-1')).toBe(
      true,
    );
    expect(underutil?.driverAnalysis.possibleConfounders.length).toBeGreaterThan(0);

    const costs = summary.weaknessDrivers.find((d) => d.weaknessId === 'RISING_COSTS');
    expect(costs?.driverAnalysis.primaryFactors.some((f) => f.key.includes('WORKSHOP'))).toBe(
      true,
    );
    expect(costs?.driverAnalysis.historicalComparison.length).toBeGreaterThan(0);
  });

  it('attaches driver analysis to strength and weakness items', () => {
    const snapshot = baseSnapshot();
    const strength: EvaluationsDetectedStrength = {
      id: 'REVENUE_GROWTH',
      title: 'Revenue growth',
      description: 'Up',
      underlyingKpi: 'financial.revenueMtdMinor',
      comparisonBasis: 'HISTORICAL_PERIOD',
      threshold: '>= 5%',
      period,
      comparisonPeriod,
      affectedDimension: 'ORG',
      quantitativeImprovement: { value: 10, unit: 'percent', direction: 'better', label: '+10%' },
      confidence: 'HIGH',
      dataCoverage: { numerator: 1, denominator: 1, percent: 100 },
      rationale: 'Growth',
    };

    const enriched = attachDriverAnalysisToStrengths(
      {
        calculationVersion: 'strength-detection-v1',
        period,
        comparisonPeriod,
        strengths: [strength],
        rulesEvaluated: 1,
        rulesSuppressed: [],
        highlights: [],
      },
      snapshot,
    );

    expect(enriched.strengths[0]?.driverAnalysis?.disclaimer).toContain('Correlation');
    expect(enriched.strengths[0]?.driverAnalysis?.historicalComparison.length).toBeGreaterThan(0);
  });

  it('driverAnalysisSectionStatus reflects confidence', () => {
    const snapshot = baseSnapshot();
    const summary = buildDriverAnalysisSummary({
      snapshot,
      strengths: [],
      weaknesses: [],
      activeRisks: null,
    });
    expect(driverAnalysisSectionStatus(summary)).toBe('UNAVAILABLE');
  });
});
