/**
 * Pure builders for canonical Auswertungen cost model (Prompt 21/54).
 */
import type { EvaluationsTimePeriod } from './evaluations-analytics-primitives.contract';
import {
  EVALUATIONS_COST_MODEL_VERSION,
  type EvaluationsCostDataGap,
  type EvaluationsCostKpi,
  type EvaluationsCostKpiStatus,
  type EvaluationsCostModelSnapshot,
  type EvaluationsCostModelSummary,
} from './evaluations-cost-model.contract';

function coveragePercent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function safeDivide(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round(numerator / denominator);
}

function baseKpi(
  key: EvaluationsCostKpi['key'],
  label: string,
  formula: string,
  dataSources: string[],
  period: EvaluationsTimePeriod,
  currency: string,
  status: EvaluationsCostKpiStatus,
  coverage: EvaluationsCostKpi['coverage'],
  valueMinor: number | null,
  unit: string,
  breakdown?: EvaluationsCostKpi['breakdown'],
): EvaluationsCostKpi {
  return {
    key,
    label,
    formula,
    dataSources,
    coverage,
    period,
    currency,
    status,
    calculationVersion: EVALUATIONS_COST_MODEL_VERSION,
    valueMinor,
    unit,
    breakdown,
  };
}

function buildDataGaps(snapshot: EvaluationsCostModelSnapshot): EvaluationsCostDataGap[] {
  const gaps: EvaluationsCostDataGap[] = [
    {
      category: 'CLEANING',
      reason: 'No dedicated cleaning cost ledger; vehicle cleaningStatus is operational only.',
      suggestedSource: 'Incoming invoices linked to DETAILING vendors or confirmed cleaning tasks with cost.',
    },
    {
      category: 'REPLACEMENT_VEHICLES',
      reason: 'No replacement-vehicle cost allocation model in the platform.',
      suggestedSource: 'Booking/substitution records with linked vendor invoices.',
    },
    {
      category: 'PERSONNEL',
      reason: 'No personnel or labor cost source for fleet operations.',
      suggestedSource: 'HR/payroll integration or workshop labor line items on service invoices.',
    },
    {
      category: 'DOWNTIME',
      reason: 'Downtime is tracked as vehicle status counts only; no monetary downtime ledger.',
      suggestedSource: 'ServiceCase downtime windows with vendor invoices or internal cost rates (not opportunity).',
    },
    {
      category: 'UNDERUTILIZATION',
      reason:
        'Underutilization is an operational signal (vehicle counts), not an actual cost. Opportunity revenue is excluded from actual costs.',
      suggestedSource: 'Separate revenue-opportunity analytics; do not mix with cost ledger.',
    },
    {
      category: 'NO_SHOW',
      reason: 'No-show bookings are counted; forfeited revenue or penalty charges are not reliably linked.',
      suggestedSource: 'Booking payment requests / cancellation fee invoices tied to NO_SHOW status.',
    },
    {
      category: 'CANCELLATION',
      reason: 'Cancelled bookings are counted; cancellation fee revenue or sunk costs are not reliably linked.',
      suggestedSource: 'Cancellation policy charges on outgoing invoices or booking payment requests.',
    },
    {
      category: 'TIRES',
      reason: 'Tire health data exists without a dedicated tire cost ledger.',
      suggestedSource: 'ServiceCase TIRES category actualCostCents and tire vendor invoices.',
    },
    {
      category: 'BRAKES',
      reason: 'Brake health and service events exist without a dedicated brake cost rollup.',
      suggestedSource: 'ServiceCase BRAKES category and brake-related VehicleServiceEvent.costCents.',
    },
    {
      category: 'BATTERY',
      reason: 'Battery health evidence exists without a dedicated battery cost rollup.',
      suggestedSource: 'ServiceCase BATTERY category and battery service event costs.',
    },
  ];

  const towingMinor = snapshot.vendorCategoryExpenses.TOWING ?? 0;
  if (towingMinor <= 0) {
    gaps.push({
      category: 'TOWING',
      reason: 'No incoming invoices linked to TOWING vendors in the selected period.',
      suggestedSource: 'OrgInvoice with vendor.category = TOWING.',
    });
  }

  const insuranceMinor = snapshot.vendorCategoryExpenses.INSURANCE ?? 0;
  if (insuranceMinor <= 0 && snapshot.vehiclesWithFixedCostData === 0) {
    gaps.push({
      category: 'INSURANCE',
      reason: 'No insurance premium invoices and no vehicle insurance master data.',
      suggestedSource: 'Vehicle.insuranceCostCents or INSURANCE vendor invoices.',
    });
  }

  if (snapshot.serviceCasesWithActualCostCount < snapshot.serviceCasesTotalInPeriod) {
    gaps.push({
      category: 'MAINTENANCE',
      reason: `${snapshot.serviceCasesTotalInPeriod - snapshot.serviceCasesWithActualCostCount} service case(s) in period lack actualCostCents.`,
      suggestedSource: 'ServiceCase.actualCostCents on completion.',
    });
  }

  if (snapshot.damagesWithRepairCostCount < snapshot.damagesTotalInPeriod) {
    gaps.push({
      category: 'DAMAGES',
      reason: `${snapshot.damagesTotalInPeriod - snapshot.damagesWithRepairCostCount} damage record(s) in period lack repairCostCents.`,
      suggestedSource: 'VehicleDamage.repairCostCents when repair is completed.',
    });
  }

  return gaps;
}

export function buildCostModelSummary(
  snapshot: EvaluationsCostModelSnapshot,
  period: EvaluationsTimePeriod,
): EvaluationsCostModelSummary {
  const currency = snapshot.currency;
  const actualExpensesMinor = snapshot.invoiceExpensesMinor;
  const recordedMaintenanceCostsMinor =
    snapshot.serviceCaseCostsMinor + snapshot.serviceEventCostsMinor;

  const totals = {
    actualExpensesMinor,
    estimatedFixedCostsMinor: snapshot.estimatedFixedCostsMinor,
    recordedDamageCostsMinor: snapshot.damageRepairCostsMinor,
    recordedMaintenanceCostsMinor,
    invoiceExpenseCount: snapshot.invoiceExpenseCount,
    invoicesWithVehicleLinkCount: snapshot.invoicesWithVehicleIdCount,
  };

  const denominators = {
    vehicleCount: snapshot.vehicleCount,
    completedBookings: snapshot.completedBookingsInPeriod,
    totalKmDriven: snapshot.totalKmDriven,
    bookingsWithKm: snapshot.bookingsWithKmCount,
    totalRentalDays: snapshot.totalRentalDays,
    bookingsWithRentalDays: snapshot.bookingsWithRentalDaysCount,
    cancelledBookings: snapshot.cancelledBookingsInPeriod,
    noShowBookings: snapshot.noShowBookingsInPeriod,
  };

  const invoiceVehicleCoverage = coveragePercent(
    snapshot.invoicesWithVehicleIdCount,
    snapshot.invoiceExpenseCount,
  );

  const metrics: EvaluationsCostKpi[] = [
    baseKpi(
      'TOTAL_OPERATING_EXPENSES',
      'Total operating expenses',
      'SUM(OrgInvoice.totalCents) WHERE type IN (INCOMING_VENDOR, INCOMING_UPLOADED) AND status NOT IN excluded expense statuses AND invoiceDate within period',
      ['OrgInvoice (incoming vendor/uploaded)'],
      period,
      currency,
      'ACTUAL',
      {
        numeratorCount: snapshot.invoiceExpenseCount,
        denominatorCount: snapshot.invoiceExpenseCount,
        percent: snapshot.invoiceExpenseCount > 0 ? 100 : null,
      },
      actualExpensesMinor,
      currency,
    ),
    baseKpi(
      'COST_PER_VEHICLE',
      'Cost per vehicle',
      'totalOperatingExpenses / vehicleCount',
      ['OrgInvoice (incoming)', 'Vehicle (scoped fleet count)'],
      period,
      currency,
      invoiceVehicleCoverage != null && invoiceVehicleCoverage < 100 ? 'PARTIAL' : 'ACTUAL',
      {
        numeratorCount: snapshot.invoicesWithVehicleIdCount,
        denominatorCount: snapshot.vehicleCount,
        percent: invoiceVehicleCoverage,
        notes:
          invoiceVehicleCoverage != null && invoiceVehicleCoverage < 100
            ? 'Expenses without vehicleId are included in numerator but not allocated per vehicle.'
            : undefined,
      },
      safeDivide(actualExpensesMinor, snapshot.vehicleCount),
      `${currency}/vehicle`,
    ),
    baseKpi(
      'COST_PER_KM',
      'Cost per kilometer',
      'totalOperatingExpenses / SUM(Booking.kmDriven) for completed bookings in period',
      ['OrgInvoice (incoming)', 'Booking.kmDriven (completed)'],
      period,
      currency,
      snapshot.bookingsWithKmCount > 0 ? 'PARTIAL' : 'UNAVAILABLE',
      {
        numeratorCount: snapshot.bookingsWithKmCount,
        denominatorCount: snapshot.completedBookingsInPeriod,
        percent: coveragePercent(snapshot.bookingsWithKmCount, snapshot.completedBookingsInPeriod),
        notes:
          snapshot.bookingsWithKmCount === 0
            ? 'No completed bookings with kmDriven in period.'
            : 'Uses fleet-wide expenses over recorded km only.',
      },
      safeDivide(actualExpensesMinor, snapshot.totalKmDriven),
      `${currency}/km`,
    ),
    baseKpi(
      'COST_PER_RENTAL_DAY',
      'Cost per rental day',
      'totalOperatingExpenses / SUM(BookingPriceSnapshot.rentalDays) for completed bookings in period',
      ['OrgInvoice (incoming)', 'BookingPriceSnapshot.rentalDays'],
      period,
      currency,
      snapshot.bookingsWithRentalDaysCount > 0 ? 'PARTIAL' : 'UNAVAILABLE',
      {
        numeratorCount: snapshot.bookingsWithRentalDaysCount,
        denominatorCount: snapshot.completedBookingsInPeriod,
        percent: coveragePercent(
          snapshot.bookingsWithRentalDaysCount,
          snapshot.completedBookingsInPeriod,
        ),
      },
      safeDivide(actualExpensesMinor, snapshot.totalRentalDays),
      `${currency}/rental-day`,
    ),
    baseKpi(
      'COST_PER_BOOKING',
      'Cost per booking',
      'totalOperatingExpenses / COUNT(completed bookings in period)',
      ['OrgInvoice (incoming)', 'Booking (completed)'],
      period,
      currency,
      snapshot.completedBookingsInPeriod > 0 ? 'PARTIAL' : 'UNAVAILABLE',
      {
        numeratorCount: snapshot.invoiceExpenseCount,
        denominatorCount: snapshot.completedBookingsInPeriod,
        percent: coveragePercent(snapshot.invoiceExpenseCount, snapshot.completedBookingsInPeriod),
        notes: 'Fleet-wide expenses divided by completed booking count.',
      },
      safeDivide(actualExpensesMinor, snapshot.completedBookingsInPeriod),
      `${currency}/booking`,
    ),
    baseKpi(
      'UNPLANNED_MAINTENANCE_COSTS',
      'Unplanned maintenance costs',
      'SUM(ServiceCase.actualCostCents) WHERE category IN (REPAIR, DIAGNOSTIC) AND completedAt within period',
      ['ServiceCase.actualCostCents (REPAIR, DIAGNOSTIC)'],
      period,
      currency,
      snapshot.unplannedRepairCostsMinor > 0
        ? snapshot.serviceCasesWithActualCostCount < snapshot.serviceCasesTotalInPeriod
          ? 'PARTIAL'
          : 'ACTUAL'
        : 'UNAVAILABLE',
      {
        numeratorCount: snapshot.serviceCasesWithActualCostCount,
        denominatorCount: snapshot.serviceCasesTotalInPeriod,
        percent: coveragePercent(
          snapshot.serviceCasesWithActualCostCount,
          snapshot.serviceCasesTotalInPeriod,
        ),
      },
      snapshot.unplannedRepairCostsMinor > 0 ? snapshot.unplannedRepairCostsMinor : null,
      currency,
    ),
    baseKpi(
      'DAMAGE_REPAIR_COSTS',
      'Damage repair costs',
      'SUM(VehicleDamage.repairCostCents) WHERE repair event within period',
      ['VehicleDamage.repairCostCents'],
      period,
      currency,
      snapshot.damagesWithRepairCostCount > 0
        ? snapshot.damagesWithRepairCostCount < snapshot.damagesTotalInPeriod
          ? 'PARTIAL'
          : 'ACTUAL'
        : 'UNAVAILABLE',
      {
        numeratorCount: snapshot.damagesWithRepairCostCount,
        denominatorCount: snapshot.damagesTotalInPeriod,
        percent: coveragePercent(
          snapshot.damagesWithRepairCostCount,
          snapshot.damagesTotalInPeriod,
        ),
      },
      snapshot.damageRepairCostsMinor > 0 ? snapshot.damageRepairCostsMinor : null,
      currency,
    ),
    baseKpi(
      'COST_BY_VEHICLE_CLASS',
      'Costs by vehicle class',
      'SUM(OrgInvoice.totalCents) grouped by Vehicle.rentalCategoryId for invoices with vehicleId',
      ['OrgInvoice (incoming)', 'Vehicle.rentalCategoryId'],
      period,
      currency,
      snapshot.expensesByVehicleClass.length > 0 ? 'PARTIAL' : 'UNAVAILABLE',
      {
        numeratorCount: snapshot.invoicesWithVehicleIdCount,
        denominatorCount: snapshot.invoiceExpenseCount,
        percent: invoiceVehicleCoverage,
      },
      snapshot.expensesByVehicleClass.reduce((sum, row) => sum + row.expensesMinor, 0) || null,
      currency,
      snapshot.expensesByVehicleClass.map((row) => ({
        dimension: 'VEHICLE_CLASS' as const,
        key: row.vehicleClassId,
        label: row.vehicleClassName,
        valueMinor: row.expensesMinor,
        vehicleCount: row.vehicleCount,
      })),
    ),
    baseKpi(
      'COST_BY_STATION',
      'Costs by station',
      'SUM(OrgInvoice.totalCents) grouped by Vehicle.homeStationId for invoices with vehicleId',
      ['OrgInvoice (incoming)', 'Vehicle.homeStationId'],
      period,
      currency,
      snapshot.expensesByStation.length > 0 ? 'PARTIAL' : 'UNAVAILABLE',
      {
        numeratorCount: snapshot.invoicesWithVehicleIdCount,
        denominatorCount: snapshot.invoiceExpenseCount,
        percent: invoiceVehicleCoverage,
      },
      snapshot.expensesByStation.reduce((sum, row) => sum + row.expensesMinor, 0) || null,
      currency,
      snapshot.expensesByStation.map((row) => ({
        dimension: 'STATION' as const,
        key: row.stationId,
        label: row.stationName,
        valueMinor: row.expensesMinor,
        vehicleCount: row.vehicleCount,
      })),
    ),
    baseKpi(
      'ESTIMATED_FIXED_COSTS',
      'Estimated fixed costs (master data)',
      'SUM(Vehicle.leasingRateCents + insuranceCostCents + taxCostCents) pro-rated to period days / 30',
      ['Vehicle.leasingRateCents', 'Vehicle.insuranceCostCents', 'Vehicle.taxCostCents'],
      period,
      currency,
      snapshot.vehiclesWithFixedCostData > 0 ? 'ESTIMATED' : 'UNAVAILABLE',
      {
        numeratorCount: snapshot.vehiclesWithFixedCostData,
        denominatorCount: snapshot.vehicleCount,
        percent: coveragePercent(snapshot.vehiclesWithFixedCostData, snapshot.vehicleCount),
        notes: 'Monthly master-data estimates, not confirmed payments.',
      },
      snapshot.estimatedFixedCostsMinor > 0 ? snapshot.estimatedFixedCostsMinor : null,
      currency,
    ),
    baseKpi(
      'UNPLANNED_DOWNTIME_COSTS',
      'Unplanned downtime costs',
      'N/A — no monetary downtime ledger',
      [],
      period,
      currency,
      'UNAVAILABLE',
      { numeratorCount: 0, denominatorCount: 0, percent: null },
      null,
      currency,
    ),
    baseKpi(
      'UNDERUTILIZATION_POTENTIAL',
      'Underutilization potential',
      'N/A — opportunity metric excluded from actual costs',
      ['Vehicle utilization signals (counts only)'],
      period,
      currency,
      'UNAVAILABLE',
      { numeratorCount: 0, denominatorCount: 0, percent: null, notes: 'Not an actual cost.' },
      null,
      currency,
    ),
    baseKpi(
      'NO_SHOW_CANCELLATION_COSTS',
      'No-show and cancellation costs',
      'N/A — booking counts only; financial impact not reliably linked',
      ['Booking.status (CANCELLED, NO_SHOW)'],
      period,
      currency,
      'UNAVAILABLE',
      {
        numeratorCount: snapshot.cancelledBookingsInPeriod + snapshot.noShowBookingsInPeriod,
        denominatorCount: snapshot.completedBookingsInPeriod,
        percent: null,
        notes: `Cancelled: ${snapshot.cancelledBookingsInPeriod}, No-show: ${snapshot.noShowBookingsInPeriod} (counts only).`,
      },
      null,
      currency,
    ),
  ];

  return {
    calculationVersion: EVALUATIONS_COST_MODEL_VERSION,
    currency,
    period,
    totals,
    denominators,
    metrics,
    dataGaps: buildDataGaps(snapshot),
  };
}

export function costModelSectionStatus(summary: EvaluationsCostModelSummary): 'OK' | 'PARTIAL' | 'UNAVAILABLE' {
  const statuses = summary.metrics.map((m) => m.status);
  if (statuses.some((s) => s === 'ACTUAL' || s === 'ESTIMATED' || s === 'PARTIAL')) {
    return statuses.every((s) => s === 'ACTUAL') ? 'OK' : 'PARTIAL';
  }
  return 'UNAVAILABLE';
}
