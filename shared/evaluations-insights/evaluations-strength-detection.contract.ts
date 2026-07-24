/**
 * Canonical Auswertungen strength detection (Prompt 23/54).
 * Rule-based, traceable organizational strengths — no unverified industry benchmarks.
 */
import type { EvaluationsTimePeriod } from './evaluations-analytics-primitives.contract';
import type { EvaluationsHighlightItem } from './evaluations-analytics-summary.contract';
import type { EvaluationsDriverAnalysis } from './evaluations-driver-analysis.contract';

export const EVALUATIONS_STRENGTH_DETECTION_VERSION = 'strength-detection-v1';

export type EvaluationsStrengthId =
  | 'HIGH_UTILIZATION'
  | 'REVENUE_GROWTH'
  | 'HIGH_PAYMENT_COLLECTION'
  | 'LOW_OVERDUE_RATE'
  | 'LOW_CANCELLATION_RATE'
  | 'LOW_UNPLANNED_DOWNTIME'
  | 'SHORT_TURNAROUND'
  | 'LOW_DAMAGE_RATE'
  | 'STABLE_VEHICLE_AVAILABILITY'
  | 'GOOD_DATA_QUALITY'
  | 'STRONG_STATION'
  | 'STRONG_VEHICLE_CLASS';

export type EvaluationsStrengthComparisonBasis =
  | 'HISTORICAL_PERIOD'
  | 'ORG_TARGET'
  | 'PEER_STATIONS';

export type EvaluationsStrengthDimension = 'ORG' | 'STATION' | 'VEHICLE_CLASS' | 'FLEET';

export type EvaluationsStrengthConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface EvaluationsStrengthDataCoverage {
  numerator: number;
  denominator: number;
  percent: number | null;
  notes?: string;
}

export interface EvaluationsStrengthQuantitativeImprovement {
  value: number;
  unit: 'percent' | 'count' | 'ms' | 'ratio' | 'currency_minor';
  direction: 'better';
  label: string;
}

export interface EvaluationsDetectedStrength {
  id: EvaluationsStrengthId;
  title: string;
  description: string;
  underlyingKpi: string;
  comparisonBasis: EvaluationsStrengthComparisonBasis;
  threshold: string;
  period: EvaluationsTimePeriod;
  comparisonPeriod?: EvaluationsTimePeriod;
  affectedDimension: EvaluationsStrengthDimension;
  dimensionKey?: string;
  dimensionLabel?: string;
  quantitativeImprovement: EvaluationsStrengthQuantitativeImprovement | null;
  confidence: EvaluationsStrengthConfidence;
  dataCoverage: EvaluationsStrengthDataCoverage;
  rationale: string;
  /** Ursachen- und Einflussanalyse when sufficient data exists (Prompt 25/54). */
  driverAnalysis?: EvaluationsDriverAnalysis | null;
}

export interface EvaluationsSuppressedStrengthRule {
  ruleId: EvaluationsStrengthId;
  reason: string;
}

export interface EvaluationsStrengthDetectionSummary {
  calculationVersion: string;
  period: EvaluationsTimePeriod;
  comparisonPeriod: EvaluationsTimePeriod;
  strengths: EvaluationsDetectedStrength[];
  rulesEvaluated: number;
  rulesSuppressed: EvaluationsSuppressedStrengthRule[];
  /** Legacy highlight cards for existing UI consumers. */
  highlights: EvaluationsHighlightItem[];
}

/** Org-default targets until persisted organization goals exist. */
export interface EvaluationsStrengthOrgTargets {
  utilizationPercent: number;
  revenueGrowthPercent: number;
  paymentCollectionPercent: number;
  maxOverdueRatePercent: number;
  maxCancellationRatePercent: number;
  maxUnplannedDowntimePercent: number;
  maxTurnaroundHours: number;
  maxDamageCostRatioPercent: number;
  minVehicleReadyPercent: number;
  minDataCoveragePercent: number;
  peerOutperformancePercentPoints: number;
}

export const DEFAULT_STRENGTH_ORG_TARGETS: EvaluationsStrengthOrgTargets = {
  utilizationPercent: 70,
  revenueGrowthPercent: 5,
  paymentCollectionPercent: 80,
  maxOverdueRatePercent: 5,
  maxCancellationRatePercent: 10,
  maxUnplannedDowntimePercent: 5,
  maxTurnaroundHours: 24,
  maxDamageCostRatioPercent: 5,
  minVehicleReadyPercent: 80,
  minDataCoveragePercent: 80,
  peerOutperformancePercentPoints: 10,
};

/** Minimum data requirements per rule category. */
export interface EvaluationsStrengthDetectionSnapshot {
  period: EvaluationsTimePeriod;
  comparisonPeriod: EvaluationsTimePeriod;
  currency: string;
  financial: {
    revenueCurrentMinor: number;
    revenuePreviousMinor: number;
    paidRevenueCurrentMinor: number;
    openReceivablesMinor: number;
    overdueReceivablesMinor: number;
    openReceivablesCount: number;
  };
  bookings: {
    completedInPeriod: number;
    cancelledInPeriod: number;
    noShowInPeriod: number;
  };
  fleet: {
    total: number;
    available: number;
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
    stationBreakdown: Array<{
      stationId: string;
      stationName: string;
      utilizationPercent: number | null;
      vehicleCount: number;
    }>;
    classBreakdown: Array<{
      vehicleClassId: string;
      vehicleClassName: string;
      utilizationPercent: number | null;
      vehicleCount: number;
    }>;
  };
  costs: {
    available: boolean;
    recordedDamageCostsMinor: number;
    revenueCurrentMinor: number;
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
