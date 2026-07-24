/**
 * Canonical Ursachen- und Einflussanalyse for Auswertungen (Prompt 25/54).
 * Data-based attribution — correlation is never labeled as causation.
 */
import type { EvaluationsTimePeriod } from './evaluations-analytics-primitives.contract';
import type { EvaluationsStrengthId } from './evaluations-strength-detection.contract';
import type { EvaluationsWeaknessId } from './evaluations-weakness-detection.contract';

export const EVALUATIONS_DRIVER_ANALYSIS_VERSION = 'driver-analysis-v1';

export const DRIVER_ANALYSIS_DISCLAIMER =
  'Factors indicate statistical association within the filtered dataset. Correlation is not causation.';

export type EvaluationsDriverOutcomeKind = 'STRENGTH' | 'WEAKNESS' | 'RISK';

export type EvaluationsDriverFactorRole = 'PRIMARY' | 'SECONDARY';

export type EvaluationsDriverTrendDirection = 'IMPROVING' | 'WORSENING' | 'STABLE' | 'UNKNOWN';

export type EvaluationsDriverConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface EvaluationsDriverQuantitativeContribution {
  factorKey: string;
  label: string;
  value: number;
  unit: 'percent' | 'count' | 'ms' | 'ratio' | 'currency_minor' | 'percentage_points';
  sharePercent: number | null;
  direction: 'positive' | 'negative' | 'neutral';
  dataSource: string;
  confidence: EvaluationsDriverConfidence;
}

export interface EvaluationsDriverEntityRef {
  entityType: 'STATION' | 'VEHICLE_CLASS' | 'VEHICLE';
  entityId: string;
  label: string;
  metricLabel?: string;
  metricValue?: number | null;
}

export interface EvaluationsDriverFactor {
  role: EvaluationsDriverFactorRole;
  key: string;
  label: string;
  description: string;
  dataSource: string;
  confidence: EvaluationsDriverConfidence;
  quantitativeContribution: EvaluationsDriverQuantitativeContribution | null;
}

export interface EvaluationsDriverHistoricalComparison {
  metricKey: string;
  label: string;
  currentValue: number | null;
  comparisonValue: number | null;
  deltaPercent: number | null;
  unit: string;
  period: EvaluationsTimePeriod;
  comparisonPeriod: EvaluationsTimePeriod;
}

export interface EvaluationsDriverAnalysis {
  calculationVersion: string;
  outcomeKind: EvaluationsDriverOutcomeKind;
  outcomeId: string;
  disclaimer: string;
  primaryFactors: EvaluationsDriverFactor[];
  secondaryFactors: EvaluationsDriverFactor[];
  quantitativeContributions: EvaluationsDriverQuantitativeContribution[];
  affectedStations: EvaluationsDriverEntityRef[];
  affectedVehicleClasses: EvaluationsDriverEntityRef[];
  affectedVehicles: EvaluationsDriverEntityRef[];
  affectedTimePeriods: EvaluationsTimePeriod[];
  trend: {
    direction: EvaluationsDriverTrendDirection;
    label: string;
    confidence: EvaluationsDriverConfidence;
    notes?: string;
  };
  historicalComparison: EvaluationsDriverHistoricalComparison[];
  possibleConfounders: string[];
  dataQualityWarnings: string[];
  overallConfidence: EvaluationsDriverConfidence;
}

export type EvaluationsRiskDriverCategory =
  | 'BUSINESS_RISK'
  | 'REVENUE_LEAKAGE'
  | 'COMPLIANCE'
  | 'CRITICAL_INSIGHTS';

export interface EvaluationsRiskDriverOutcome {
  category: EvaluationsRiskDriverCategory;
  title: string;
  insightGroupCount: number;
  driverAnalysis: EvaluationsDriverAnalysis;
}

export interface EvaluationsDriverAnalysisSummary {
  calculationVersion: string;
  period: EvaluationsTimePeriod;
  comparisonPeriod: EvaluationsTimePeriod;
  disclaimer: string;
  strengthDrivers: Array<{ strengthId: EvaluationsStrengthId; driverAnalysis: EvaluationsDriverAnalysis }>;
  weaknessDrivers: Array<{ weaknessId: EvaluationsWeaknessId; driverAnalysis: EvaluationsDriverAnalysis }>;
  riskDrivers: EvaluationsRiskDriverOutcome[];
  analysesProduced: number;
  analysesSkipped: Array<{ outcomeKind: EvaluationsDriverOutcomeKind; outcomeId: string; reason: string }>;
}

/** Unified snapshot for driver attribution — same filter scope as parent KPIs. */
export interface EvaluationsDriverAnalysisSnapshot {
  period: EvaluationsTimePeriod;
  comparisonPeriod: EvaluationsTimePeriod;
  currency: string;
  financial: {
    revenueCurrentMinor: number;
    revenuePreviousMinor: number;
    expensesCurrentMinor: number;
    expensesPreviousMinor: number;
    openReceivablesMinor: number;
    overdueReceivablesMinor: number;
    openReceivablesCount: number;
    overdueReceivablesCount: number;
    receivablesAgingBuckets: Array<{
      bucketKey: string;
      label: string;
      amountMinor: number;
      count: number;
    }>;
  };
  bookings: {
    completedInPeriod: number;
    cancelledInPeriod: number;
    noShowInPeriod: number;
  };
  fleet: {
    total: number;
    underutilized: number;
    maintenance: number;
    blocked: number;
  };
  utilization: {
    available: boolean;
    orgUtilizationPercent: number | null;
    stationBreakdown: Array<{
      stationId: string;
      stationName: string;
      utilizationPercent: number | null;
      vehicleCount: number;
      deltaVsOrgPercentPoints: number | null;
    }>;
    classBreakdown: Array<{
      vehicleClassId: string;
      vehicleClassName: string;
      utilizationPercent: number | null;
      vehicleCount: number;
      deltaVsOrgPercentPoints: number | null;
    }>;
    vehiclesWithHighDowntime: Array<{
      vehicleId: string;
      label: string;
      unplannedDowntimeMs: number;
      downtimeSharePercent: number;
    }>;
    stationBottlenecks: Array<{
      stationId: string;
      stationName: string;
      availableVehicles: number;
      totalVehicles: number;
    }>;
    unplannedDowntimeMs: number;
    fleetCapacityMs: number;
    avgTurnaroundMs: number | null;
  };
  costs: {
    available: boolean;
    vehicleCount: number;
    vendorCategoryExpenses: Record<string, number>;
    expensesByStation: Array<{
      stationId: string;
      stationName: string;
      expensesMinor: number;
      vehicleCount: number;
      sharePercent: number | null;
    }>;
    expensesByVehicleClass: Array<{
      vehicleClassId: string;
      vehicleClassName: string;
      expensesMinor: number;
      vehicleCount: number;
      sharePercent: number | null;
    }>;
    recordedDamageCostsMinor: number;
    unplannedRepairCostsMinor: number;
    serviceCaseCostsMinor: number;
  };
  insights: {
    businessRiskGroups: number;
    revenueLeakageGroups: number;
    complianceInsightGroups: number;
    criticalInsights: number;
    affectedVehicles: number;
    affectedStations: number;
    affectedBookings: number;
    estimatedExposureMinor: number;
    exposureCurrency: string;
  };
  dataQuality: {
    overallStatus: string;
    partialSectionCount: number;
    unavailableSectionCount: number;
    hasOverlappingBookings: boolean;
    insightsStale: boolean;
    partialSections: string[];
  };
}
