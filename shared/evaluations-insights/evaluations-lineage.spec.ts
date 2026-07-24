/**
 * Unit tests for Auswertungen lineage and freshness (Prompt 27/54).
 */
import { buildEvaluationsDataQualityDomain } from './evaluations-data-quality';
import {
  attachLineageToCostModel,
  attachLineageToUtilizationModel,
  buildEvaluationsLineageSummary,
  lineageForMetric,
  lineageSectionStatus,
} from './evaluations-lineage';
import type { EvaluationsLineageBuildInput } from './evaluations-lineage.contract';
import { resolveLineageAudience } from './evaluations-lineage.contract';
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
  overrides: Partial<EvaluationsLineageBuildInput> = {},
): EvaluationsLineageBuildInput {
  const dqInput = {
    period: PERIOD,
    generatedAt: '2026-07-24T10:00:00.000Z',
    sectionStatuses: [{ key: 'financial', status: 'OK' as const }],
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
      lastRunAt: '2026-07-24T09:55:00.000Z',
      hasRun: true,
      error: null,
    },
    costModelSnapshot: {
      currency: 'EUR',
      invoiceExpensesMinor: 40_000,
      invoiceExpenseCount: 15,
      invoicesWithVehicleIdCount: 14,
      vendorCategoryExpenses: {},
      damageRepairCostsMinor: 0,
      damagesWithRepairCostCount: 2,
      damagesTotalInPeriod: 2,
      serviceCaseCostsMinor: 5000,
      unplannedRepairCostsMinor: 0,
      serviceCasesWithActualCostCount: 4,
      serviceCasesTotalInPeriod: 4,
      serviceEventCostsMinor: 0,
      serviceEventsWithCostCount: 0,
      serviceEventsTotalInPeriod: 0,
      estimatedFixedCostsMinor: 0,
      vehiclesWithFixedCostData: 8,
      vehicleCount: 10,
      completedBookingsInPeriod: 20,
      cancelledBookingsInPeriod: 0,
      noShowBookingsInPeriod: 0,
      totalKmDriven: 5000,
      bookingsWithKmCount: 20,
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
        estimatedFixedCostsMinor: 0,
        recordedDamageCostsMinor: 0,
        recordedMaintenanceCostsMinor: 5000,
        invoiceExpenseCount: 15,
        invoicesWithVehicleLinkCount: 14,
      },
      denominators: {
        vehicleCount: 10,
        completedBookings: 20,
        totalKmDriven: 5000,
        bookingsWithKm: 20,
        totalRentalDays: 60,
        bookingsWithRentalDays: 20,
        cancelledBookings: 0,
        noShowBookings: 0,
      },
      metrics: [
        {
          key: 'COST_PER_VEHICLE' as const,
          label: 'Cost per vehicle',
          formula: 'x',
          dataSources: ['OrgInvoice'],
          coverage: { numeratorCount: 10, denominatorCount: 10, percent: 100 },
          period: PERIOD,
          currency: 'EUR',
          status: 'ACTUAL' as const,
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
        periodMs: 1,
        fleetCapacityMs: 1,
        rentedMs: 1,
        availableMs: 0,
        maintenanceMs: 0,
        blockedMs: 0,
        unplannedDowntimeMs: 0,
        turnaroundMs: 0,
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
          key: 'UTILIZATION_PER_VEHICLE' as const,
          label: 'Utilization per vehicle',
          formula: 'x',
          dataSources: ['Booking intervals'],
          coverage: {
            numeratorMs: 1,
            denominatorMs: 1,
            vehicleCount: 10,
            vehiclesWithData: 10,
            percent: 100,
          },
          period: PERIOD,
          status: 'OK' as const,
          calculationVersion: EVALUATIONS_UTILIZATION_MODEL_VERSION,
          valueMs: 1,
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
      vehicles: [],
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
  };

  const dataQuality = buildEvaluationsDataQualityDomain(
    dqInput as import('./evaluations-data-quality.contract').EvaluationsDataQualityBuildInput,
  );

  return {
    period: PERIOD,
    generatedAt: '2026-07-24T10:00:00.000Z',
    audience: 'STANDARD',
    dataQuality,
    loaderHealth: dqInput.loaderHealth,
    financial: dqInput.financial,
    bookings: dqInput.bookings,
    fleet: dqInput.fleet,
    insights: dqInput.insights,
    costModelSummary: dqInput.costModelSummary as import('./evaluations-cost-model.contract').EvaluationsCostModelSummary,
    costModelSnapshot: dqInput.costModelSnapshot,
    utilizationModelSummary: dqInput.utilizationModelSummary as import('./evaluations-utilization-model.contract').EvaluationsUtilizationModelSummary,
    utilizationSnapshot: dqInput.utilizationSnapshot,
    overlappingBookingCount: 0,
    sectionStatuses: [{ key: 'financial', status: 'OK' }],
    ...overrides,
  };
}

describe('evaluations-lineage', () => {
  it('builds lineage with required provenance fields per metric', () => {
    const summary = buildEvaluationsLineageSummary(baseInput());
    expect(summary.calculationVersion).toBe('lineage-v1');
    expect(summary.metrics.length).toBeGreaterThan(0);
    const revenue = lineageForMetric(summary, 'financial.revenueMtdMinor');
    expect(revenue?.dataSources.length).toBeGreaterThan(0);
    expect(revenue?.oldestIncludedRecordAt).toBe(PERIOD.from);
    expect(revenue?.newestIncludedRecordAt).toBe(PERIOD.to);
    expect(revenue?.calculatedAt).toBe('2026-07-24T10:00:00.000Z');
    expect(revenue?.calculationVersion).toBeTruthy();
    expect(revenue?.dataCoverage).toBeDefined();
    expect(revenue?.freshness.state).toBe('FRESH');
  });

  it('marks fresh data as FRESH', () => {
    const summary = buildEvaluationsLineageSummary(baseInput());
    const revenue = lineageForMetric(summary, 'financial.revenueMtdMinor');
    expect(revenue?.freshness.state).toBe('FRESH');
    expect(revenue?.lastSuccessfulImportAt).toBe('2026-07-24T10:00:00.000Z');
  });

  it('marks delayed/stale insights as STALE', () => {
    const input = baseInput({
      insights: {
        stale: true,
        lastRunAt: '2026-07-20T00:00:00.000Z',
        hasRun: true,
        error: null,
      },
    });
    input.dataQuality = buildEvaluationsDataQualityDomain({
      ...input,
      period: PERIOD,
      generatedAt: input.generatedAt,
      sectionStatuses: input.sectionStatuses,
      insights: input.insights,
    } as Parameters<typeof buildEvaluationsDataQualityDomain>[0]);
    const summary = buildEvaluationsLineageSummary(input);
    const critical = lineageForMetric(summary, 'activeRisks.criticalInsights');
    expect(critical?.freshness.state).toBe('STALE');
    expect(critical?.freshness.staleThresholdLabel).toContain('24h');
  });

  it('marks failed job / loader as FAILED', () => {
    const input = baseInput({
      loaderHealth: {
        financial: { ok: false, error: 'Loader failed' },
        bookings: { ok: true },
        fleet: { ok: true },
        insights: { ok: false, error: 'Job failed' },
        costModel: { ok: false },
        utilizationModel: { ok: false },
      },
      insights: { stale: true, lastRunAt: null, hasRun: false, error: 'Scheduler error' },
    });
    input.dataQuality = buildEvaluationsDataQualityDomain({
      period: PERIOD,
      generatedAt: input.generatedAt,
      sectionStatuses: input.sectionStatuses,
      loaderHealth: input.loaderHealth,
      financial: null,
      bookings: input.bookings,
      fleet: input.fleet,
      insights: input.insights,
      costModelSummary: null,
      costModelSnapshot: null,
      utilizationModelSummary: null,
      utilizationSnapshot: null,
      overlappingBookingCount: 0,
    });
    const summary = buildEvaluationsLineageSummary(input);
    const revenue = lineageForMetric(summary, 'financial.revenueMtdMinor');
    expect(revenue?.freshness.state).toBe('FAILED');
    expect(summary.sourceErrors.length).toBeGreaterThan(0);
  });

  it('handles partially available sources with exclusions', () => {
    const input = baseInput();
    if (input.costModelSnapshot) {
      input.costModelSnapshot.bookingsWithKmCount = 10;
      input.costModelSnapshot.completedBookingsInPeriod = 20;
    }
    const summary = buildEvaluationsLineageSummary(input);
    const bookings = lineageForMetric(summary, 'bookings.completed');
    expect(bookings?.exclusionReasons.some((e) => e.reasonCode === 'MISSING_KM')).toBe(true);
    expect(bookings?.excludedRecordCount).toBeGreaterThan(0);
    expect(lineageSectionStatus(summary, [{ key: 'bookings', status: 'PARTIAL' }])).toBe('PARTIAL');
  });

  it('records manual on-demand recalculation for admin audience', () => {
    const summary = buildEvaluationsLineageSummary(
      baseInput({ audience: 'ADMIN', recalculationTrigger: 'ON_DEMAND' }),
    );
    const revenue = lineageForMetric(summary, 'financial.revenueMtdMinor');
    expect(revenue?.adminDiagnostics?.recalculationTrigger).toBe('ON_DEMAND');
    expect(revenue?.adminDiagnostics?.loaderKey).toBe('financial');
  });

  it('records cached responses for admin audience', () => {
    const summary = buildEvaluationsLineageSummary(
      baseInput({
        audience: 'ADMIN',
        recalculationTrigger: 'CACHE',
        servedFromCache: true,
        cacheGeneratedAt: '2026-07-24T09:00:00.000Z',
      }),
    );
    const revenue = lineageForMetric(summary, 'financial.revenueMtdMinor');
    expect(revenue?.adminDiagnostics?.servedFromCache).toBe(true);
    expect(revenue?.adminDiagnostics?.cacheGeneratedAt).toBe('2026-07-24T09:00:00.000Z');
  });

  it('strips admin diagnostics for standard audience', () => {
    const summary = buildEvaluationsLineageSummary(
      baseInput({ audience: 'STANDARD', recalculationTrigger: 'ON_DEMAND' }),
    );
    const revenue = lineageForMetric(summary, 'financial.revenueMtdMinor');
    expect(revenue?.adminDiagnostics).toBeUndefined();
  });

  it('attaches lineage to cost and utilization model metrics', () => {
    const input = baseInput();
    const summary = buildEvaluationsLineageSummary(input);
    const cost = attachLineageToCostModel(input.costModelSummary!, summary);
    const util = attachLineageToUtilizationModel(input.utilizationModelSummary!, summary);
    expect(cost.metrics[0].lineage?.metricKey).toBe('costModel.COST_PER_VEHICLE');
    expect(util.metrics[0].lineage?.metricKey).toBe('utilizationModel.UTILIZATION_PER_VEHICLE');
  });

  it('documents sources without lineage v1', () => {
    const summary = buildEvaluationsLineageSummary(baseInput());
    expect(summary.sourcesWithoutLineage).toContain('PAYROLL_PERSONNEL');
  });

  it('resolves admin audience from org admin role', () => {
    expect(resolveLineageAudience('ORG_ADMIN')).toBe('ADMIN');
    expect(resolveLineageAudience('WORKER')).toBe('STANDARD');
    expect(resolveLineageAudience('WORKER', 'MASTER_ADMIN')).toBe('ADMIN');
  });

  it('marks source errors on affected metrics', () => {
    const input = baseInput({ overlappingBookingCount: 2 });
    input.dataQuality = buildEvaluationsDataQualityDomain({
      period: PERIOD,
      generatedAt: input.generatedAt,
      sectionStatuses: input.sectionStatuses,
      loaderHealth: input.loaderHealth,
      financial: input.financial,
      bookings: input.bookings,
      fleet: input.fleet,
      insights: input.insights,
      costModelSummary: input.costModelSummary,
      costModelSnapshot: input.costModelSnapshot,
      utilizationModelSummary: input.utilizationModelSummary,
      utilizationSnapshot: input.utilizationSnapshot,
      overlappingBookingCount: 2,
    });
    const summary = buildEvaluationsLineageSummary(input);
    const util = lineageForMetric(summary, 'utilizationModel.UTILIZATION_PER_VEHICLE');
    expect(util?.exclusionReasons.some((e) => e.reasonCode === 'OVERLAPPING_BOOKINGS')).toBe(true);
    expect(summary.sourceErrors.some((e) => e.affectsMetrics.length > 0)).toBe(true);
  });
});
