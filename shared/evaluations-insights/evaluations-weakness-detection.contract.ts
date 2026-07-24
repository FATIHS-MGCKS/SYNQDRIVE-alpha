/**
 * Canonical Auswertungen weakness & improvement-potential detection (Prompt 24/54).
 * Rule-based, traceable — no unverified industry benchmarks.
 */
import type { EvaluationsTimePeriod } from './evaluations-analytics-primitives.contract';
import type { EvaluationsHighlightItem } from './evaluations-analytics-summary.contract';
import type { EvaluationsDriverAnalysis } from './evaluations-driver-analysis.contract';

export const EVALUATIONS_WEAKNESS_DETECTION_VERSION = 'weakness-detection-v1';

export type EvaluationsWeaknessId =
  | 'UNDERUTILIZATION'
  | 'DECLINING_REVENUE'
  | 'RISING_COSTS'
  | 'LOW_MARGIN'
  | 'HIGH_OVERDUE_RECEIVABLES'
  | 'HIGH_CANCELLATION_RATE'
  | 'HIGH_NO_SHOW_RATE'
  | 'LONG_TURNAROUND'
  | 'RECURRING_VEHICLE_BREAKDOWNS'
  | 'HIGH_DAMAGE_RATE'
  | 'STATION_BOTTLENECKS'
  | 'COMPLIANCE_RISKS'
  | 'POOR_DATA_QUALITY';

export type EvaluationsWeaknessCategory =
  | 'UTILIZATION'
  | 'REVENUE'
  | 'COST'
  | 'MARGIN'
  | 'RECEIVABLES'
  | 'BOOKINGS'
  | 'OPERATIONS'
  | 'FLEET_HEALTH'
  | 'DAMAGE'
  | 'CAPACITY'
  | 'COMPLIANCE'
  | 'DATA_QUALITY';

export type EvaluationsWeaknessSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type EvaluationsWeaknessComparisonBasis =
  | 'HISTORICAL_PERIOD'
  | 'ORG_TARGET'
  | 'PEER_STATIONS'
  | 'OBSERVED_THRESHOLD';

export type EvaluationsWeaknessEvidenceKind = 'OBSERVATION' | 'ESTIMATE' | 'FORECAST';

export type EvaluationsWeaknessConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface EvaluationsWeaknessDataCoverage {
  numerator: number;
  denominator: number;
  percent: number | null;
  notes?: string;
}

export interface EvaluationsWeaknessQuantitativeDeviation {
  value: number;
  unit: 'percent' | 'count' | 'ms' | 'ratio' | 'currency_minor';
  direction: 'worse';
  label: string;
  kind: EvaluationsWeaknessEvidenceKind;
}

export interface EvaluationsWeaknessFinancialImpact {
  kind: EvaluationsWeaknessEvidenceKind;
  amountMinor: number | null;
  currency: string;
  label: string;
  notes?: string;
}

export interface EvaluationsWeaknessAffectedEntities {
  entityType: 'ORG' | 'FLEET' | 'STATION' | 'VEHICLE_CLASS' | 'VEHICLE';
  vehicles: number;
  stations: number;
  bookings: number;
  insightGroups: number;
  dimensionKey?: string;
  dimensionLabel?: string;
}

export interface EvaluationsDetectedWeakness {
  id: EvaluationsWeaknessId;
  category: EvaluationsWeaknessCategory;
  severity: EvaluationsWeaknessSeverity;
  title: string;
  description: string;
  underlyingKpis: string[];
  quantitativeDeviation: EvaluationsWeaknessQuantitativeDeviation;
  period: EvaluationsTimePeriod;
  comparisonPeriod?: EvaluationsTimePeriod;
  comparisonBasis: EvaluationsWeaknessComparisonBasis;
  affectedEntities: EvaluationsWeaknessAffectedEntities;
  financialImpact: EvaluationsWeaknessFinancialImpact | null;
  confidence: EvaluationsWeaknessConfidence;
  dataCoverage: EvaluationsWeaknessDataCoverage;
  recommendedNextAnalysis: string;
  /** Lower = higher priority after severity sort. */
  priority: number;
  /** Ursachen- und Einflussanalyse when sufficient data exists (Prompt 25/54). */
  driverAnalysis?: EvaluationsDriverAnalysis | null;
}

export interface EvaluationsSuppressedWeaknessRule {
  ruleId: EvaluationsWeaknessId;
  reason: string;
}

export interface EvaluationsWeaknessDetectionSummary {
  calculationVersion: string;
  period: EvaluationsTimePeriod;
  comparisonPeriod: EvaluationsTimePeriod;
  weaknesses: EvaluationsDetectedWeakness[];
  rulesEvaluated: number;
  rulesSuppressed: EvaluationsSuppressedWeaknessRule[];
  /** Legacy highlight cards for existing UI consumers. */
  highlights: EvaluationsHighlightItem[];
}

export interface EvaluationsWeaknessOrgTargets {
  minUtilizationPercent: number;
  maxRevenueDeclinePercent: number;
  maxCostGrowthPercent: number;
  minMarginPercent: number;
  maxOverdueRatePercent: number;
  maxCancellationRatePercent: number;
  maxNoShowRatePercent: number;
  maxTurnaroundHours: number;
  maxDamageCostRatioPercent: number;
  minVehiclesWithRepeatDowntime: number;
  vehicleDowntimeShareThresholdPercent: number;
  minDataCoveragePercent: number;
}

export const DEFAULT_WEAKNESS_ORG_TARGETS: EvaluationsWeaknessOrgTargets = {
  minUtilizationPercent: 40,
  maxRevenueDeclinePercent: -5,
  maxCostGrowthPercent: 10,
  minMarginPercent: 10,
  maxOverdueRatePercent: 5,
  maxCancellationRatePercent: 10,
  maxNoShowRatePercent: 5,
  maxTurnaroundHours: 48,
  maxDamageCostRatioPercent: 5,
  minVehiclesWithRepeatDowntime: 2,
  vehicleDowntimeShareThresholdPercent: 15,
  minDataCoveragePercent: 80,
};

export interface EvaluationsWeaknessDetectionSnapshot {
  period: EvaluationsTimePeriod;
  comparisonPeriod: EvaluationsTimePeriod;
  currency: string;
  financial: {
    revenueCurrentMinor: number;
    revenuePreviousMinor: number;
    expensesCurrentMinor: number;
    expensesPreviousMinor: number;
    paidRevenueCurrentMinor: number;
    openReceivablesMinor: number;
    overdueReceivablesMinor: number;
    openReceivablesCount: number;
    overdueReceivablesCount: number;
  };
  bookings: {
    completedInPeriod: number;
    cancelledInPeriod: number;
    noShowInPeriod: number;
  };
  fleet: {
    total: number;
    available: number;
    maintenance: number;
    blocked: number;
    readyPercent: number | null;
    underutilized: number;
  };
  utilization: {
    available: boolean;
    timeWeightedUtilizationPercent: number | null;
    operationalSnapshotUtilizationPercent: number | null;
    vehiclesWithData: number;
    vehicleCount: number;
    unplannedDowntimeMs: number;
    fleetCapacityMs: number;
    avgTurnaroundMs: number | null;
    turnaroundCount: number;
    stationBottlenecks: Array<{
      stationId: string;
      stationName: string;
      totalVehicles: number;
      availableVehicles: number;
    }>;
    vehiclesWithHighDowntime: Array<{
      vehicleId: string;
      label: string;
      unplannedDowntimeMs: number;
      capacityMs: number;
      downtimeSharePercent: number;
    }>;
    weakStations: Array<{
      stationId: string;
      stationName: string;
      utilizationPercent: number | null;
      vehicleCount: number;
    }>;
  };
  costs: {
    available: boolean;
    recordedDamageCostsMinor: number;
    actualExpensesMinor: number;
    revenueCurrentMinor: number;
  };
  insights: {
    businessRiskGroups: number;
    revenueLeakageGroups: number;
    criticalInsights: number;
    criticalBookings: number;
    complianceInsightGroups: number;
    estimatedExposureMinor: number;
    exposureCurrency: string;
    affectedVehicles: number;
    affectedStations: number;
    affectedBookings: number;
  };
  dataQuality: {
    overallStatus: 'OK' | 'PARTIAL' | 'UNAVAILABLE' | 'ERROR';
    invoiceDataComplete: boolean;
    fleetDataComplete: boolean;
    insightsStale: boolean;
    partialSectionCount: number;
    unavailableSectionCount: number;
    hasOverlappingBookings: boolean;
  };
}
