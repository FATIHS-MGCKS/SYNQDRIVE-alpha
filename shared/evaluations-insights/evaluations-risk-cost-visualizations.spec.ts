/**
 * Risk, cost & downtime visualization resolver tests (Prompt 33/54).
 */
import {
  resolveCostDowntimeSeries,
  resolveCostPareto,
  resolveCostWaterfall,
  resolveDimensionComparison,
  resolveFleetFailureTrend,
  resolveReceivablesAging,
  resolveRiskCostVisualizations,
  resolveRiskMatrix,
} from './evaluations-risk-cost-visualizations';
import { EVALUATIONS_RISK_COST_VIZ_VERSION } from './evaluations-risk-cost-visualizations.contract';
import type { EvaluationsAnalyticsSummaryResponse } from './evaluations-analytics-summary.contract';

const period = {
  key: 'mtd',
  label: 'Juli 2026',
  from: '2026-07-01',
  to: '2026-07-24',
  timezone: 'Europe/Berlin',
};

const comparisonPeriod = {
  key: 'prev',
  label: 'Juni 2026',
  from: '2026-06-01',
  to: '2026-06-30',
  timezone: 'Europe/Berlin',
};

const envelopeOk = <T>(data: T) => ({
  status: 'OK' as const,
  data,
  error: null,
  generatedAt: '2026-07-24T10:00:00.000Z',
});

function baseSummary(overrides: Partial<EvaluationsAnalyticsSummaryResponse> = {}): EvaluationsAnalyticsSummaryResponse {
  return {
    organizationId: 'org-1',
    generatedAt: '2026-07-24T10:00:00.000Z',
    period,
    comparisonPeriod,
    appliedFilters: {} as EvaluationsAnalyticsSummaryResponse['appliedFilters'],
    overallStatus: 'OK',
    executive: envelopeOk(null),
    financial: envelopeOk({
      revenueMtdMinor: 500_000,
      revenuePreviousMinor: 400_000,
      revenueDeltaPercent: 25,
      expensesMtdMinor: 200_000,
      expensesPreviousMinor: 180_000,
      expensesDeltaPercent: 11,
      netMarginMinor: 300_000,
      paidRevenueMtdMinor: 420_000,
      currency: 'EUR',
    }),
    receivables: envelopeOk({
      openCount: 5,
      openAmountMinor: 50_000,
      overdueCount: 2,
      overdueAmountMinor: 15_000,
      currency: 'EUR',
    }),
    bookings: envelopeOk(null),
    fleetUtilization: envelopeOk(null),
    vehicleAvailability: envelopeOk(null),
    downtime: envelopeOk({
      maintenanceVehicles: 3,
      blockedVehicles: 1,
      cleaningRequiredVehicles: 2,
      totalDowntimeVehicles: 6,
      downtimePercent: 8.5,
    }),
    costs: envelopeOk({
      expensesMtdMinor: 200_000,
      expensesPreviousMinor: 180_000,
      expensesDeltaPercent: 11,
      fixedCostsMtdMinor: 80_000,
      variableCostsMtdMinor: 120_000,
      currency: 'EUR',
    }),
    costModel: envelopeOk({
      calculationVersion: 'cost-model-v1',
      currency: 'EUR',
      period,
      totals: {
        actualExpensesMinor: 200_000,
        estimatedFixedCostsMinor: 80_000,
        recordedDamageCostsMinor: 12_000,
        recordedMaintenanceCostsMinor: 25_000,
        invoiceExpenseCount: 40,
        invoicesWithVehicleLinkCount: 35,
      },
      denominators: {
        vehicleCount: 12,
        completedBookings: 40,
        totalKmDriven: 5000,
        bookingsWithKm: 38,
        totalRentalDays: 120,
        bookingsWithRentalDays: 40,
        cancelledBookings: 3,
        noShowBookings: 1,
      },
      metrics: [
        {
          key: 'COST_BY_STATION',
          label: 'Cost by station',
          formula: 'sum',
          dataSources: ['invoices'],
          coverage: { numeratorCount: 10, denominatorCount: 12, percent: 83 },
          period,
          currency: 'EUR',
          status: 'ACTUAL',
          calculationVersion: 'v1',
          valueMinor: 200_000,
          unit: 'EUR',
          breakdown: [
            { dimension: 'STATION', key: 'st-1', label: 'Berlin Central Station with a very long name', valueMinor: 120_000, vehicleCount: 6 },
            { dimension: 'STATION', key: 'st-2', label: 'Munich', valueMinor: 50_000, vehicleCount: 4 },
            { dimension: 'STATION', key: 'st-3', label: 'Hamburg', valueMinor: 30_000, vehicleCount: 2 },
          ],
        },
      ],
      dataGaps: [],
    }),
    utilizationModel: envelopeOk({
      calculationVersion: 'utilization-model-v1',
      period,
      totals: {
        periodMs: 2_000_000,
        fleetCapacityMs: 5_000_000,
        rentedMs: 3_000_000,
        availableMs: 1_000_000,
        maintenanceMs: 500_000,
        blockedMs: 200_000,
        unplannedDowntimeMs: 300_000,
        turnaroundMs: 100_000,
        standstillMs: 50_000,
        bookedNotRealizedMs: 0,
        availableNotRentableCount: 0,
        capacityBottleneckStations: 1,
        overlappingBookingCount: 0,
        telemetryOfflineCount: 0,
      },
      operationalSnapshot: {
        activeRented: 8,
        reserved: 1,
        available: 2,
        maintenance: 1,
        blocked: 0,
        unknown: 0,
        operationalUtilizationPercent: 72,
      },
      metrics: [
        {
          key: 'UTILIZATION_BY_STATION',
          label: 'Utilization by station',
          formula: 'rented/capacity',
          dataSources: ['runtime'],
          coverage: { numeratorMs: 1, denominatorMs: 2, vehicleCount: 12, vehiclesWithData: 10, percent: 83 },
          period,
          status: 'OK',
          calculationVersion: 'v1',
          valueMs: null,
          valuePercent: 72,
          unit: 'percent',
          breakdown: [
            { dimension: 'STATION', key: 'st-1', label: 'Berlin', rentedMs: 1, capacityMs: 2, utilizationPercent: 85, vehicleCount: 6 },
            { dimension: 'STATION', key: 'st-2', label: 'Munich', rentedMs: 1, capacityMs: 2, utilizationPercent: 55, vehicleCount: 4 },
          ],
        },
      ],
      drillDowns: [],
      dataGaps: [],
    }),
    activeRisks: envelopeOk({
      businessRiskGroups: 4,
      revenueLeakageGroups: 2,
      complianceInsightGroups: 1,
      criticalInsights: 3,
      criticalBookings: 1,
      estimatedExposureMinor: 45_000,
      exposureCurrency: 'EUR',
      orgWideRisks: 5,
      bookingScopedRisks: 2,
    }),
    affectedEntities: envelopeOk(null),
    strengths: envelopeOk(null),
    weaknesses: envelopeOk(null),
    driverAnalysis: envelopeOk({
      calculationVersion: 'driver-analysis-v1',
      period,
      comparisonPeriod,
      disclaimer: 'Correlation is not causation.',
      strengthDrivers: [],
      weaknessDrivers: [],
      riskDrivers: [],
      analysesProduced: 0,
      analysesSkipped: [],
    }),
    dataQuality: envelopeOk(null),
    lineage: envelopeOk(null),
    insights: envelopeOk({ hasRun: true, lastRunAt: '2026-07-24T09:00:00.000Z', stale: false, error: null }),
    metadata: {
      generationDurationMs: 1,
      sectionCount: 1,
      okSections: 1,
      partialSections: 0,
      errorSections: 0,
      unavailableSections: 0,
    },
    ...overrides,
  };
}

describe('evaluations-risk-cost-visualizations (shared)', () => {
  it('returns versioned bundle', () => {
    const bundle = resolveRiskCostVisualizations(baseSummary());
    expect(bundle.calculationVersion).toBe(EVALUATIONS_RISK_COST_VIZ_VERSION);
    expect(bundle.riskMatrix.hasData).toBe(true);
    expect(bundle.costWaterfall.hasData).toBe(true);
    expect(bundle.costPareto.hasData).toBe(true);
    expect(bundle.receivablesAging.hasData).toBe(true);
    expect(bundle.fleetFailureTrend.hasData).toBe(true);
    expect(bundle.dimensionComparison.hasData).toBe(true);
  });

  it('builds risk matrix points with probability and impact scales', () => {
    const matrix = resolveRiskMatrix(baseSummary());
    expect(matrix.points.length).toBeGreaterThan(0);
    for (const p of matrix.points) {
      expect(p.probability).toBeGreaterThanOrEqual(1);
      expect(p.probability).toBeLessThanOrEqual(5);
      expect(p.impact).toBeGreaterThanOrEqual(1);
      expect(p.impact).toBeLessThanOrEqual(5);
      expect(p.isEstimate).toBe(true);
    }
  });

  it('builds cost waterfall steps from cost model totals', () => {
    const waterfall = resolveCostWaterfall(baseSummary());
    expect(waterfall.steps.length).toBeGreaterThan(3);
    expect(waterfall.steps.some((s) => s.isEstimate)).toBe(true);
    expect(waterfall.steps.find((s) => s.key === 'total')?.valueMinor).toBe(200_000);
  });

  it('builds pareto with cumulative percent', () => {
    const pareto = resolveCostPareto(baseSummary());
    expect(pareto.items.length).toBe(3);
    expect(pareto.items[0].cumulativePercent).toBeGreaterThanOrEqual(pareto.items[0].sharePercent);
    if (pareto.items.length > 1) {
      expect(pareto.items[1].cumulativePercent).toBeGreaterThan(pareto.items[1].sharePercent);
    }
    expect(pareto.items.at(-1)?.cumulativePercent).toBe(100);
  });

  it('uses null gaps in cost/downtime series for comparison downtime', () => {
    const series = resolveCostDowntimeSeries(baseSummary());
    expect(series.points[0].costsMinor).toBe(180_000);
    expect(series.points[0].downtimePercent).toBeNull();
    expect(series.points[1].downtimePercent).toBe(8.5);
  });

  it('builds receivables aging buckets', () => {
    const aging = resolveReceivablesAging(baseSummary());
    expect(aging.buckets.length).toBe(2);
    expect(aging.totalOpenMinor).toBe(50_000);
    expect(aging.buckets.reduce((s, b) => s + b.amountMinor, 0)).toBe(50_000);
  });

  it('handles empty summary without throwing', () => {
    const bundle = resolveRiskCostVisualizations(null);
    expect(bundle.riskMatrix.hasData).toBe(false);
    expect(bundle.costPareto.hasData).toBe(false);
  });

  it('supports long labels in pareto', () => {
    const pareto = resolveCostPareto(baseSummary());
    expect(pareto.items[0].label.length).toBeGreaterThan(20);
  });

  it('dimension comparison switches station vs class', () => {
    const station = resolveDimensionComparison(baseSummary(), 'STATION');
    expect(station.items.length).toBeGreaterThan(0);
    const vehicleClass = resolveDimensionComparison(baseSummary(), 'VEHICLE_CLASS');
    expect(vehicleClass.mode).toBe('VEHICLE_CLASS');
  });

  it('fleet failure trend marks comparison gaps as null', () => {
    const trend = resolveFleetFailureTrend(baseSummary());
    expect(trend.points[0].maintenanceVehicles).toBeNull();
    expect(trend.points[1].maintenanceVehicles).toBe(3);
  });
});
