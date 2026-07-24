import {
  buildCostModelSummary,
  costModelSectionStatus,
} from './evaluations-cost-model';
import type { EvaluationsCostModelSnapshot } from './evaluations-cost-model.contract';
import { EVALUATIONS_COST_MODEL_VERSION } from './evaluations-cost-model.contract';

const period = {
  key: 'mtd',
  label: 'Month to date',
  from: '2026-06-01T00:00:00.000Z',
  to: '2026-06-16T12:00:00.000Z',
  timezone: 'Europe/Berlin',
};

const snapshot: EvaluationsCostModelSnapshot = {
  currency: 'EUR',
  invoiceExpensesMinor: 120_000,
  invoiceExpenseCount: 8,
  invoicesWithVehicleIdCount: 6,
  vendorCategoryExpenses: { TOWING: 5_000, WORKSHOP: 40_000 },
  damageRepairCostsMinor: 15_000,
  damagesWithRepairCostCount: 2,
  damagesTotalInPeriod: 3,
  serviceCaseCostsMinor: 25_000,
  unplannedRepairCostsMinor: 18_000,
  serviceCasesWithActualCostCount: 3,
  serviceCasesTotalInPeriod: 4,
  serviceEventCostsMinor: 10_000,
  serviceEventsWithCostCount: 2,
  serviceEventsTotalInPeriod: 5,
  estimatedFixedCostsMinor: 32_000,
  vehiclesWithFixedCostData: 8,
  vehicleCount: 10,
  completedBookingsInPeriod: 40,
  cancelledBookingsInPeriod: 3,
  noShowBookingsInPeriod: 1,
  totalKmDriven: 12_000,
  bookingsWithKmCount: 35,
  totalRentalDays: 90,
  bookingsWithRentalDaysCount: 38,
  expensesByStation: [
    { stationId: 'st-1', stationName: 'Berlin', expensesMinor: 70_000, vehicleCount: 5 },
    { stationId: 'st-2', stationName: 'Munich', expensesMinor: 50_000, vehicleCount: 4 },
  ],
  expensesByVehicleClass: [
    { vehicleClassId: 'cls-1', vehicleClassName: 'Compact', expensesMinor: 60_000, vehicleCount: 6 },
  ],
};

describe('evaluations-cost-model (shared)', () => {
  it('buildCostModelSummary exposes traceable KPI metadata', () => {
    const summary = buildCostModelSummary(snapshot, period);

    expect(summary.calculationVersion).toBe(EVALUATIONS_COST_MODEL_VERSION);
    expect(summary.totals.actualExpensesMinor).toBe(120_000);
    expect(summary.totals.estimatedFixedCostsMinor).toBe(32_000);

    const costPerVehicle = summary.metrics.find((m) => m.key === 'COST_PER_VEHICLE');
    expect(costPerVehicle?.valueMinor).toBe(12_000);
    expect(costPerVehicle?.formula).toContain('vehicleCount');
    expect(costPerVehicle?.dataSources.length).toBeGreaterThan(0);
    expect(costPerVehicle?.calculationVersion).toBe(EVALUATIONS_COST_MODEL_VERSION);

    const downtime = summary.metrics.find((m) => m.key === 'UNPLANNED_DOWNTIME_COSTS');
    expect(downtime?.status).toBe('UNAVAILABLE');
    expect(downtime?.valueMinor).toBeNull();

    const underutil = summary.metrics.find((m) => m.key === 'UNDERUTILIZATION_POTENTIAL');
    expect(underutil?.status).toBe('UNAVAILABLE');
    expect(underutil?.coverage.notes).toContain('Not an actual cost');
  });

  it('documents data gaps for missing cost sources', () => {
    const summary = buildCostModelSummary(snapshot, period);
    const categories = summary.dataGaps.map((g) => g.category);

    expect(categories).toContain('PERSONNEL');
    expect(categories).toContain('CLEANING');
    expect(categories).toContain('UNDERUTILIZATION');
    expect(categories).toContain('DAMAGES');
  });

  it('costModelSectionStatus returns PARTIAL when mix of actual and unavailable KPIs', () => {
    const summary = buildCostModelSummary(snapshot, period);
    expect(costModelSectionStatus(summary)).toBe('PARTIAL');
  });

  it('computes ratio KPIs from denominators', () => {
    const summary = buildCostModelSummary(snapshot, period);

    expect(summary.metrics.find((m) => m.key === 'COST_PER_KM')?.valueMinor).toBe(10);
    expect(summary.metrics.find((m) => m.key === 'COST_PER_RENTAL_DAY')?.valueMinor).toBe(1333);
    expect(summary.metrics.find((m) => m.key === 'COST_PER_BOOKING')?.valueMinor).toBe(3000);
    expect(summary.metrics.find((m) => m.key === 'DAMAGE_REPAIR_COSTS')?.valueMinor).toBe(15_000);
  });
});
