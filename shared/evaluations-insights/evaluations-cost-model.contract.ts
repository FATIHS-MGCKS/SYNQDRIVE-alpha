/**
 * Canonical Auswertungen cost model (Prompt 21/54).
 * Traceable KPI definitions with formula, sources, coverage, and calculation version.
 * Opportunity costs must never be labeled as actual costs.
 */
import type { EvaluationsTimePeriod } from './evaluations-analytics-primitives.contract';
import type { EvaluationsMetricDataQualityAttachment } from './evaluations-data-quality.contract';
import type { EvaluationsMetricLineage } from './evaluations-lineage.contract';

export const EVALUATIONS_COST_MODEL_VERSION = 'cost-model-v1';

/** Whether a KPI is backed by actual ledger data, master-data estimates, partial coverage, or unavailable. */
export type EvaluationsCostKpiStatus = 'ACTUAL' | 'ESTIMATED' | 'PARTIAL' | 'UNAVAILABLE';

export type EvaluationsCostKpiKey =
  | 'COST_PER_VEHICLE'
  | 'COST_PER_KM'
  | 'COST_PER_RENTAL_DAY'
  | 'COST_PER_BOOKING'
  | 'UNPLANNED_MAINTENANCE_COSTS'
  | 'DAMAGE_REPAIR_COSTS'
  | 'COST_BY_VEHICLE_CLASS'
  | 'COST_BY_STATION'
  | 'UNPLANNED_DOWNTIME_COSTS'
  | 'UNDERUTILIZATION_POTENTIAL'
  | 'NO_SHOW_CANCELLATION_COSTS'
  | 'TOTAL_OPERATING_EXPENSES'
  | 'ESTIMATED_FIXED_COSTS';

export interface EvaluationsCostCoverage {
  /** Records used in the numerator (or primary measure). */
  numeratorCount: number;
  /** Population or denominator size for coverage. */
  denominatorCount: number;
  /** 0–100 when computable; null when not applicable. */
  percent: number | null;
  notes?: string;
}

export interface EvaluationsCostKpiDefinition {
  key: EvaluationsCostKpiKey;
  label: string;
  formula: string;
  dataSources: string[];
  coverage: EvaluationsCostCoverage;
  period: EvaluationsTimePeriod;
  currency: string;
  status: EvaluationsCostKpiStatus;
  calculationVersion: string;
}

export interface EvaluationsCostBreakdownItem {
  dimension: 'STATION' | 'VEHICLE_CLASS' | 'VENDOR_CATEGORY';
  key: string;
  label: string;
  valueMinor: number;
  vehicleCount?: number;
}

export interface EvaluationsCostKpi extends EvaluationsCostKpiDefinition {
  valueMinor: number | null;
  unit: string;
  breakdown?: EvaluationsCostBreakdownItem[];
  /** Data quality status for this KPI (Prompt 26/54). */
  dataQuality?: EvaluationsMetricDataQualityAttachment;
  /** Lineage and freshness metadata (Prompt 27/54). */
  lineage?: EvaluationsMetricLineage;
}

export interface EvaluationsCostDataGap {
  category:
    | 'MAINTENANCE'
    | 'REPAIRS'
    | 'DAMAGES'
    | 'TIRES'
    | 'BRAKES'
    | 'BATTERY'
    | 'CLEANING'
    | 'DOWNTIME'
    | 'TOWING'
    | 'REPLACEMENT_VEHICLES'
    | 'INSURANCE'
    | 'PERSONNEL'
    | 'OPERATIONAL_THIRD_PARTY'
    | 'NO_SHOW'
    | 'CANCELLATION'
    | 'UNDERUTILIZATION';
  reason: string;
  suggestedSource: string;
}

export interface EvaluationsCostModelDenominators {
  vehicleCount: number;
  completedBookings: number;
  totalKmDriven: number;
  bookingsWithKm: number;
  totalRentalDays: number;
  bookingsWithRentalDays: number;
  cancelledBookings: number;
  noShowBookings: number;
}

export interface EvaluationsCostModelTotals {
  actualExpensesMinor: number;
  estimatedFixedCostsMinor: number;
  recordedDamageCostsMinor: number;
  recordedMaintenanceCostsMinor: number;
  invoiceExpenseCount: number;
  invoicesWithVehicleLinkCount: number;
}

export interface EvaluationsCostModelSummary {
  calculationVersion: string;
  currency: string;
  period: EvaluationsTimePeriod;
  totals: EvaluationsCostModelTotals;
  denominators: EvaluationsCostModelDenominators;
  metrics: EvaluationsCostKpi[];
  dataGaps: EvaluationsCostDataGap[];
}

/** Raw repository snapshot — aggregated counts only, no PII. */
export interface EvaluationsCostModelSnapshot {
  currency: string;
  invoiceExpensesMinor: number;
  invoiceExpenseCount: number;
  invoicesWithVehicleIdCount: number;
  vendorCategoryExpenses: Record<string, number>;
  damageRepairCostsMinor: number;
  damagesWithRepairCostCount: number;
  damagesTotalInPeriod: number;
  serviceCaseCostsMinor: number;
  unplannedRepairCostsMinor: number;
  serviceCasesWithActualCostCount: number;
  serviceCasesTotalInPeriod: number;
  serviceEventCostsMinor: number;
  serviceEventsWithCostCount: number;
  serviceEventsTotalInPeriod: number;
  estimatedFixedCostsMinor: number;
  vehiclesWithFixedCostData: number;
  vehicleCount: number;
  completedBookingsInPeriod: number;
  cancelledBookingsInPeriod: number;
  noShowBookingsInPeriod: number;
  totalKmDriven: number;
  bookingsWithKmCount: number;
  totalRentalDays: number;
  bookingsWithRentalDaysCount: number;
  expensesByStation: Array<{
    stationId: string;
    stationName: string;
    expensesMinor: number;
    vehicleCount: number;
  }>;
  expensesByVehicleClass: Array<{
    vehicleClassId: string;
    vehicleClassName: string;
    expensesMinor: number;
    vehicleCount: number;
  }>;
}
