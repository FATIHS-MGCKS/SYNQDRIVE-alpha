/**
 * Canonical Auswertungen analytics summary contract (Prompt 17/54).
 * Single server-side aggregation for the evaluations page — no PII.
 */
import type { InsightAnalyticsSummary } from './insights-analytics.contract';
import type { InsightEntityCountSummary } from './insight-entity-references.contract';
import type { EvaluationsAnalyticsAppliedFilters } from './evaluations-analytics-filters.contract';
import type {
  EvaluationsDataQuality,
  EvaluationsMetricStatus,
  EvaluationsSectionEnvelope,
  EvaluationsTimePeriod,
} from './evaluations-analytics-primitives.contract';
import type { EvaluationsCostModelSummary } from './evaluations-cost-model.contract';
import type { EvaluationsUtilizationModelSummary } from './evaluations-utilization-model.contract';
import type { EvaluationsStrengthDetectionSummary } from './evaluations-strength-detection.contract';
import type { EvaluationsWeaknessDetectionSummary } from './evaluations-weakness-detection.contract';

export type EvaluationsAnalyticsPeriod = 'mtd' | 'last7d' | 'last30d' | 'custom';

/** @deprecated Use EvaluationsMetricStatus from primitives — kept for legacy imports. */
export type EvaluationsSectionStatus = EvaluationsMetricStatus;

export type EvaluationsAnalyticsPeriodWindow = EvaluationsTimePeriod;

export type { EvaluationsSectionEnvelope, EvaluationsMetricStatus };

export interface EvaluationsExecutiveKpis {
  revenueMtdMinor: number;
  expensesMtdMinor: number;
  netMarginMinor: number;
  openReceivablesMinor: number;
  overdueReceivablesMinor: number;
  activeBookings: number;
  fleetUtilizationPercent: number | null;
  criticalRisks: number;
  currency: string;
}

export interface EvaluationsFinancialSummary {
  revenueMtdMinor: number;
  revenuePreviousMinor: number;
  revenueDeltaPercent: number | null;
  expensesMtdMinor: number;
  expensesPreviousMinor: number;
  expensesDeltaPercent: number | null;
  netMarginMinor: number;
  paidRevenueMtdMinor: number;
  currency: string;
}

export interface EvaluationsReceivablesSummary {
  openCount: number;
  openAmountMinor: number;
  overdueCount: number;
  overdueAmountMinor: number;
  currency: string;
}

export interface EvaluationsBookingSummary {
  active: number;
  pending: number;
  completed: number;
  revenueTodayMinor: number;
  revenueMtdMinor: number;
  revenuePreviousMinor: number;
  revenueDeltaPercent: number | null;
  currency: string;
}

export interface EvaluationsFleetUtilizationSummary {
  totalOperational: number;
  rented: number;
  available: number;
  reserved: number;
  utilizationPercent: number | null;
  underutilizedVehicles: number;
}

export interface EvaluationsVehicleAvailabilitySummary {
  total: number;
  available: number;
  rented: number;
  reserved: number;
  maintenance: number;
  blocked: number;
  other: number;
  readyPercent: number | null;
}

export interface EvaluationsDowntimeSummary {
  maintenanceVehicles: number;
  blockedVehicles: number;
  cleaningRequiredVehicles: number;
  totalDowntimeVehicles: number;
  downtimePercent: number | null;
}

export interface EvaluationsCostsSummary {
  expensesMtdMinor: number;
  expensesPreviousMinor: number;
  expensesDeltaPercent: number | null;
  fixedCostsMtdMinor: number | null;
  variableCostsMtdMinor: number | null;
  currency: string;
}

export interface EvaluationsActiveRisksSummary {
  businessRiskGroups: number;
  revenueLeakageGroups: number;
  complianceInsightGroups: number;
  criticalInsights: number;
  criticalBookings: number;
  estimatedExposureMinor: number;
  exposureCurrency: string;
  orgWideRisks: number;
  bookingScopedRisks: number;
}

export interface EvaluationsHighlightItem {
  code: string;
  label: string;
  severity: 'positive' | 'neutral' | 'negative';
  metric?: string;
}

/** Strength highlight derived in summary — maps to EvaluationsStrength with text metric. */
export type EvaluationsStrengthItem = EvaluationsHighlightItem & { severity: 'positive' };

/** Weakness highlight derived in summary — maps to EvaluationsWeakness with text metric. */
export type EvaluationsWeaknessItem = EvaluationsHighlightItem & { severity: 'negative' };

export type EvaluationsDataQualitySummary = EvaluationsDataQuality;

export type EvaluationsAnalyticsSummaryFilters = EvaluationsAnalyticsAppliedFilters;

export interface EvaluationsAnalyticsSummaryResponse {
  organizationId: string;
  generatedAt: string;
  period: EvaluationsAnalyticsPeriodWindow;
  comparisonPeriod: EvaluationsAnalyticsPeriodWindow;
  appliedFilters: EvaluationsAnalyticsSummaryFilters;
  overallStatus: EvaluationsSectionStatus;
  executive: EvaluationsSectionEnvelope<EvaluationsExecutiveKpis>;
  financial: EvaluationsSectionEnvelope<EvaluationsFinancialSummary>;
  receivables: EvaluationsSectionEnvelope<EvaluationsReceivablesSummary>;
  bookings: EvaluationsSectionEnvelope<EvaluationsBookingSummary>;
  fleetUtilization: EvaluationsSectionEnvelope<EvaluationsFleetUtilizationSummary>;
  vehicleAvailability: EvaluationsSectionEnvelope<EvaluationsVehicleAvailabilitySummary>;
  downtime: EvaluationsSectionEnvelope<EvaluationsDowntimeSummary>;
  costs: EvaluationsSectionEnvelope<EvaluationsCostsSummary>;
  costModel: EvaluationsSectionEnvelope<EvaluationsCostModelSummary>;
  utilizationModel: EvaluationsSectionEnvelope<EvaluationsUtilizationModelSummary>;
  activeRisks: EvaluationsSectionEnvelope<EvaluationsActiveRisksSummary>;
  affectedEntities: EvaluationsSectionEnvelope<InsightEntityCountSummary>;
  strengths: EvaluationsSectionEnvelope<EvaluationsStrengthDetectionSummary>;
  weaknesses: EvaluationsSectionEnvelope<EvaluationsWeaknessDetectionSummary>;
  dataQuality: EvaluationsSectionEnvelope<EvaluationsDataQualitySummary>;
  insights: EvaluationsSectionEnvelope<Pick<InsightAnalyticsSummary, 'hasRun' | 'lastRunAt' | 'stale' | 'error'>>;
  metadata: {
    generationDurationMs: number;
    sectionCount: number;
    okSections: number;
    partialSections: number;
    errorSections: number;
    unavailableSections: number;
  };
}

export interface EvaluationsStrengthDetectionResponse {
  organizationId: string;
  generatedAt: string;
  period: EvaluationsAnalyticsPeriodWindow;
  comparisonPeriod: EvaluationsAnalyticsPeriodWindow;
  appliedFilters: EvaluationsAnalyticsSummaryFilters;
  strengths: EvaluationsSectionEnvelope<EvaluationsStrengthDetectionSummary>;
}

export interface EvaluationsWeaknessDetectionResponse {
  organizationId: string;
  generatedAt: string;
  period: EvaluationsAnalyticsPeriodWindow;
  comparisonPeriod: EvaluationsAnalyticsPeriodWindow;
  appliedFilters: EvaluationsAnalyticsSummaryFilters;
  weaknesses: EvaluationsSectionEnvelope<EvaluationsWeaknessDetectionSummary>;
}

export interface EvaluationsAnalyticsSummaryQuery {
  stationId?: string | null;
  period?: EvaluationsAnalyticsPeriod;
}

/** Raw repository payloads — aggregated counts only, no PII. */
export interface EvaluationsFinancialSnapshot {
  revenueMtdMinor: number;
  revenuePreviousMinor: number;
  expensesMtdMinor: number;
  expensesPreviousMinor: number;
  paidRevenueMtdMinor: number;
  openReceivablesMinor: number;
  overdueReceivablesMinor: number;
  openReceivablesCount: number;
  overdueReceivablesCount: number;
  currency: string;
}

export interface EvaluationsBookingSnapshot {
  active: number;
  pending: number;
  completed: number;
  revenueTodayMinor: number;
  revenueMtdMinor: number;
  revenuePreviousMinor: number;
  currency: string;
}

export interface EvaluationsFleetSnapshot {
  total: number;
  available: number;
  rented: number;
  reserved: number;
  maintenance: number;
  blocked: number;
  other: number;
  cleaningRequired: number;
  underutilized: number;
}
