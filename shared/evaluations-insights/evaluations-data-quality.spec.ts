/**
 * Unit tests for unified Auswertungen data quality domain model (Prompt 26/54).
 */
import {
  buildEvaluationsDataQualityDomain,
  dataQualitySectionStatus,
  dataQualityWarningsFromDomain,
  enrichCostModelWithDataQuality,
  enrichUtilizationModelWithDataQuality,
  lookupMetricDataQuality,
} from './evaluations-data-quality';
import type { EvaluationsDataQualityBuildInput } from './evaluations-data-quality.contract';
import { EVALUATIONS_COST_MODEL_VERSION } from './evaluations-cost-model.contract';
import { EVALUATIONS_UTILIZATION_MODEL_VERSION } from './evaluations-utilization-model.contract';

const PERIOD = {
  key: 'mtd',
  label: 'Month to date',
  from: '2026-07-01T00:00:00.000Z',
  to: '2026-07-24T10:00:00.000Z',
  timezone: 'UTC',
};

function baseInput(
  overrides: Partial<EvaluationsDataQualityBuildInput> = {},
): EvaluationsDataQualityBuildInput {
  return {
    period: PERIOD,
    generatedAt: '2026-07-24T10:00:00.000Z',
    sectionStatuses: [
      { key: 'financial', status: 'OK' },
      { key: 'bookings', status: 'OK' },
      { key: 'fleet', status: 'OK' },
      { key: 'insights', status: 'OK' },
      { key: 'costModel', status: 'OK' },
      { key: 'utilizationModel', status: 'OK' },
    ],
    loaderHealth: {
      financial: { ok: true },
      bookings: { ok: true },
      fleet: { ok: true },
      insights: { ok: true },
      costModel: { ok: true },
      utilizationModel: { ok: true },
    },
    financial: {
      revenueMtdMinor: 100_000,
      revenuePreviousMinor: 90_000,
      expensesMtdMinor: 40_000,
      expensesPreviousMinor: 35_000,
      paidRevenueMtdMinor: 80_000,
      openReceivablesMinor: 10_000,
      overdueReceivablesMinor: 0,
      openReceivablesCount: 5,
      overdueReceivablesCount: 0,
      currency: 'EUR',
    },
    bookings: {
      active: 3,
      pending: 1,
      completed: 20,
      revenueTodayMinor: 5000,
      revenueMtdMinor: 100_000,
      revenuePreviousMinor: 90_000,
      currency: 'EUR',
    },
    fleet: {
      total: 10,
      available: 4,
      rented: 5,
      reserved: 1,
      maintenance: 0,
      blocked: 0,
      other: 0,
      cleaningRequired: 0,
      underutilized: 2,
    },
    insights: {
      stale: false,
      lastRunAt: '2026-07-24T09:00:00.000Z',
      hasRun: true,
      error: null,
    },
    costModelSnapshot: {
      currency: 'EUR',
      invoiceExpensesMinor: 40_000,
      invoiceExpenseCount: 15,
      invoicesWithVehicleIdCount: 14,
      vendorCategoryExpenses: { WORKSHOP: 20_000 },
      damageRepairCostsMinor: 2000,
      damagesWithRepairCostCount: 2,
      damagesTotalInPeriod: 2,
      serviceCaseCostsMinor: 5000,
      unplannedRepairCostsMinor: 3000,
      serviceCasesWithActualCostCount: 4,
      serviceCasesTotalInPeriod: 4,
      serviceEventCostsMinor: 0,
      serviceEventsWithCostCount: 0,
      serviceEventsTotalInPeriod: 0,
      estimatedFixedCostsMinor: 5000,
      vehiclesWithFixedCostData: 8,
      vehicleCount: 10,
      completedBookingsInPeriod: 20,
      cancelledBookingsInPeriod: 1,
      noShowBookingsInPeriod: 0,
      totalKmDriven: 5000,
      bookingsWithKmCount: 18,
      totalRentalDays: 60,
      bookingsWithRentalDaysCount: 20,
      expensesByStation: [],
      expensesByVehicleClass: [],
    },
    costModelSummary: {
      calculationVersion: EVALUATIONS_COST_MODEL_VERSION,
      currency: 'EUR',
      period: PERIOD,
      totals: {
        actualExpensesMinor: 40_000,
        estimatedFixedCostsMinor: 5000,
        recordedDamageCostsMinor: 2000,
        recordedMaintenanceCostsMinor: 5000,
        invoiceExpenseCount: 15,
        invoicesWithVehicleLinkCount: 14,
      },
      denominators: {
        vehicleCount: 10,
        completedBookings: 20,
        totalKmDriven: 5000,
        bookingsWithKm: 18,
        totalRentalDays: 60,
        bookingsWithRentalDays: 20,
        cancelledBookings: 1,
        noShowBookings: 0,
      },
      metrics: [
        {
          key: 'COST_PER_VEHICLE',
          label: 'Cost per vehicle',
          formula: 'expenses / vehicles',
          dataSources: ['OrgInvoice'],
          coverage: { numeratorCount: 10, denominatorCount: 10, percent: 100 },
          period: PERIOD,
          currency: 'EUR',
          status: 'ACTUAL',
          calculationVersion: EVALUATIONS_COST_MODEL_VERSION,
          valueMinor: 4000,
          unit: 'minor',
        },
      ],
      dataGaps: [],
    },
    utilizationModelSummary: {
      calculationVersion: EVALUATIONS_UTILIZATION_MODEL_VERSION,
      period: PERIOD,
      totals: {
        periodMs: 2_073_600_000,
        fleetCapacityMs: 20_736_000_000,
        rentedMs: 10_368_000_000,
        availableMs: 8_000_000_000,
        maintenanceMs: 0,
        blockedMs: 0,
        unplannedDowntimeMs: 0,
        turnaroundMs: 500_000_000,
        standstillMs: 0,
        bookedNotRealizedMs: 0,
        availableNotRentableCount: 0,
        capacityBottleneckStations: 0,
        overlappingBookingCount: 0,
        telemetryOfflineCount: 0,
      },
      operationalSnapshot: {
        activeRented: 5,
        reserved: 1,
        available: 4,
        maintenance: 0,
        blocked: 0,
        unknown: 0,
        operationalUtilizationPercent: 50,
      },
      metrics: [
        {
          key: 'UTILIZATION_PER_VEHICLE',
          label: 'Utilization per vehicle',
          formula: 'rented / capacity',
          dataSources: ['Booking intervals'],
          coverage: {
            numeratorMs: 10_368_000_000,
            denominatorMs: 20_736_000_000,
            vehicleCount: 10,
            vehiclesWithData: 10,
            percent: 100,
          },
          period: PERIOD,
          status: 'OK',
          calculationVersion: EVALUATIONS_UTILIZATION_MODEL_VERSION,
          valueMs: 10_368_000_000,
          valuePercent: 50,
          unit: 'percent',
        },
      ],
      drillDowns: [],
      dataGaps: [],
    },
    utilizationSnapshot: {
      periodFromMs: Date.parse(PERIOD.from),
      periodToMs: Date.parse(PERIOD.to),
      vehicles: Array.from({ length: 10 }, (_, i) => ({
        vehicleId: `v-${i}`,
        label: `Vehicle ${i}`,
        homeStationId: 's1',
        homeStationName: 'Berlin',
        vehicleClassId: 'c1',
        vehicleClassName: 'Compact',
        prismaStatus: 'AVAILABLE',
        cleaningStatus: 'CLEAN',
        rentalBlocked: false,
        telemetryOffline: false,
        operationalToken: 'AVAILABLE',
        capacityMs: 2_073_600_000,
        rentedMs: 1_000_000_000,
        maintenanceMs: 0,
        blockedMs: 0,
        unplannedDowntimeMs: 0,
        bookedNotRealizedMs: 0,
        standstillMs: 0,
        turnaroundMs: 50_000_000,
        turnaroundCount: 2,
      })),
      overlappingBookingIds: [],
      stationBottlenecks: [],
      operationalSnapshot: {
        activeRented: 5,
        reserved: 1,
        available: 4,
        maintenance: 0,
        blocked: 0,
        unknown: 0,
        operationalUtilizationPercent: 50,
      },
      maintenanceFromDowntimeWindows: 0,
      maintenanceFromSnapshotOnly: 0,
      blockedFromDowntimeWindows: 0,
      blockedFromSnapshotOnly: 0,
    },
    overlappingBookingCount: 0,
    ...overrides,
  };
}

describe('evaluations-data-quality', () => {
  it('assesses all nine integrated sources with six dimensions each', () => {
    const summary = buildEvaluationsDataQualityDomain(baseInput());
    expect(summary.calculationVersion).toBe('data-quality-v1');
    expect(summary.sources).toHaveLength(9);
    for (const source of summary.sources) {
      expect(source.dimensions).toHaveLength(6);
      expect(source.affectedMetrics.length).toBeGreaterThan(0);
      expect(source.period.from).toBe(PERIOD.from);
    }
    expect(summary.rollupStatus).toBe('GOOD');
    expect(summary.overallStatus).toBe('OK');
    expect(summary.metricBindings.length).toBeGreaterThan(0);
  });

  it('does not emit a subjective score — rollup derives from dimension states', () => {
    const summary = buildEvaluationsDataQualityDomain(baseInput());
    expect(summary).not.toHaveProperty('score');
    expect(summary).not.toHaveProperty('grade');
    const invoiceSource = summary.sources.find((s) => s.sourceKey === 'INVOICES');
    expect(invoiceSource?.overallState).toBeDefined();
    expect(invoiceSource?.dimensions.every((d) => d.thresholdReference.length > 0)).toBe(true);
  });

  it('handles complete sources as GOOD', () => {
    const summary = buildEvaluationsDataQualityDomain(baseInput());
    const fleet = summary.sources.find((s) => s.sourceKey === 'FLEET');
    expect(fleet?.overallState).toBe('GOOD');
    expect(fleet?.presentRecordCount).toBe(10);
    expect(fleet?.coveragePercent).toBe(100);
  });

  it('handles partial sources as LIMITED', () => {
    const input = baseInput();
    if (input.costModelSnapshot) {
      input.costModelSnapshot.bookingsWithKmCount = 14;
      input.costModelSnapshot.completedBookingsInPeriod = 20;
    }
    const summary = buildEvaluationsDataQualityDomain(input);
    const bookings = summary.sources.find((s) => s.sourceKey === 'BOOKINGS');
    const coverage = bookings?.dimensions.find((d) => d.dimension === 'COVERAGE');
    expect(coverage?.state).toBe('LIMITED');
    expect(bookings?.recommendedRemediation.some((r) => r.includes('kmDriven'))).toBe(true);
  });

  it('handles stale insights', () => {
    const summary = buildEvaluationsDataQualityDomain(
      baseInput({
        insights: {
          stale: true,
          lastRunAt: '2026-07-20T00:00:00.000Z',
          hasRun: true,
          error: null,
        },
      }),
    );
    const insights = summary.sources.find((s) => s.sourceKey === 'INSIGHTS');
    expect(insights?.dimensions.find((d) => d.dimension === 'FRESHNESS')?.state).toBe('STALE');
    expect(summary.insightsStale).toBe(true);
    expect(
      summary.crossCuttingIssues.some((i) => i.code === 'STALE_INSIGHTS') ||
        (insights?.knownErrors.some((e) => e.code === 'STALE_INSIGHTS') ?? false),
    ).toBe(true);
  });

  it('handles faulty overlapping bookings as INVALID', () => {
    const summary = buildEvaluationsDataQualityDomain(
      baseInput({ overlappingBookingCount: 2 }),
    );
    const bookings = summary.sources.find((s) => s.sourceKey === 'BOOKINGS');
    expect(bookings?.dimensions.find((d) => d.dimension === 'VALIDITY')?.state).toBe('INVALID');
    expect(summary.crossCuttingIssues.some((i) => i.code === 'OVERLAPPING_BOOKINGS')).toBe(true);
    expect(summary.rollupStatus).not.toBe('GOOD');
  });

  it('distinguishes NOT_CONNECTED from MISSING data', () => {
    const notConnected = buildEvaluationsDataQualityDomain(
      baseInput({
        loaderHealth: {
          financial: { ok: false, error: 'Forbidden' },
          bookings: { ok: true },
          fleet: { ok: true },
          insights: { ok: false, error: 'Never run' },
          costModel: { ok: false },
          utilizationModel: { ok: false },
        },
        financial: null,
        insights: { stale: true, lastRunAt: null, hasRun: false, error: null },
        costModelSummary: null,
        costModelSnapshot: null,
        utilizationModelSummary: null,
        utilizationSnapshot: null,
      }),
    );
    const invoices = notConnected.sources.find((s) => s.sourceKey === 'INVOICES');
    const insights = notConnected.sources.find((s) => s.sourceKey === 'INSIGHTS');
    expect(invoices?.integrationConnected).toBe(false);
    expect(invoices?.dimensions.find((d) => d.dimension === 'COMPLETENESS')?.state).toBe('NOT_CONNECTED');
    expect(insights?.dimensions.find((d) => d.dimension === 'COMPLETENESS')?.state).toBe('NOT_CONNECTED');

    const missingInsights = buildEvaluationsDataQualityDomain(
      baseInput({
        insights: { stale: true, lastRunAt: null, hasRun: false, error: null },
      }),
    );
    const insightsNeverRun = missingInsights.sources.find((s) => s.sourceKey === 'INSIGHTS');
    expect(insightsNeverRun?.dimensions.find((d) => d.dimension === 'COMPLETENESS')?.state).toBe('MISSING');

    const missingFleet = buildEvaluationsDataQualityDomain(
      baseInput({
        fleet: {
          total: 0,
          available: 0,
          rented: 0,
          reserved: 0,
          maintenance: 0,
          blocked: 0,
          other: 0,
          cleaningRequired: 0,
          underutilized: 0,
        },
      }),
    );
    const fleet = missingFleet.sources.find((s) => s.sourceKey === 'FLEET');
    expect(fleet?.dimensions.find((d) => d.dimension === 'COMPLETENESS')?.state).toBe('MISSING');
  });

  it('flows data quality into cost and utilization metric responses', () => {
    const domain = buildEvaluationsDataQualityDomain(baseInput());
    const costInput = baseInput().costModelSummary!;
    const utilInput = baseInput().utilizationModelSummary!;

    const enrichedCost = enrichCostModelWithDataQuality(costInput, domain);
    const enrichedUtil = enrichUtilizationModelWithDataQuality(utilInput, domain);

    expect(enrichedCost.metrics[0].dataQuality?.state).toBeDefined();
    expect(enrichedCost.metrics[0].dataQuality?.sourceKey).toBe('COSTS');
    expect(enrichedUtil.metrics[0].dataQuality?.state).toBeDefined();

    const binding = lookupMetricDataQuality(domain, 'financial.revenueMtdMinor');
    expect(binding?.sourceKey).toBe('INVOICES');
  });

  it('exposes remediation and known errors per source', () => {
    const summary = buildEvaluationsDataQualityDomain(
      baseInput({
        costModelSnapshot: {
          ...baseInput().costModelSnapshot!,
          serviceCasesWithActualCostCount: 1,
          serviceCasesTotalInPeriod: 4,
        },
      }),
    );
    const serviceCases = summary.sources.find((s) => s.sourceKey === 'SERVICE_CASES');
    expect(serviceCases?.knownErrors.some((e) => e.code === 'MISSING_ACTUAL_COST')).toBe(true);
    expect(serviceCases?.recommendedRemediation.length).toBeGreaterThan(0);
  });

  it('maps section status from domain rollup', () => {
    const good = buildEvaluationsDataQualityDomain(baseInput());
    expect(dataQualitySectionStatus(good)).toBe('OK');

    const bad = buildEvaluationsDataQualityDomain(
      baseInput({ overlappingBookingCount: 3 }),
    );
    expect(dataQualitySectionStatus(bad)).not.toBe('OK');
  });

  it('produces warnings for driver analysis without treating as business risk', () => {
    const summary = buildEvaluationsDataQualityDomain(
      baseInput({ overlappingBookingCount: 1 }),
    );
    const warnings = dataQualityWarningsFromDomain(summary);
    expect(warnings.some((w) => w.toLowerCase().includes('overlapping'))).toBe(true);
    expect(summary.crossCuttingIssues.every((i) => i.code !== 'BUSINESS_RISK')).toBe(true);
  });
});
