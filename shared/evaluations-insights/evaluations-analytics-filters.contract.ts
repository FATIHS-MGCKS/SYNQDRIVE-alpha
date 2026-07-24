/**
 * Unified Auswertungen analytics filter contract (Prompt 18/54).
 * Shared by summary, insights, charts, rankings, and drill-downs.
 */
import type { InsightAnalyticsCategory, InsightAnalyticsSeverity } from './insights-analytics.contract';
import type { EvaluationsAnalyticsPeriod } from './evaluations-analytics-summary.contract';

export type EvaluationsComparisonMode = 'auto' | 'previous' | 'none';

export type EvaluationsVehicleStatus =
  | 'AVAILABLE'
  | 'RENTED'
  | 'IN_SERVICE'
  | 'OUT_OF_SERVICE'
  | 'RESERVED';

export type EvaluationsBookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type EvaluationsCustomerSegment = 'INDIVIDUAL' | 'CORPORATE';

export type EvaluationsDataQualityStatus = 'OK' | 'PARTIAL' | 'STALE' | 'UNAVAILABLE';

/** URL-safe query input — no PII fields. */
export interface EvaluationsAnalyticsFiltersQuery {
  period?: EvaluationsAnalyticsPeriod | 'custom';
  from?: string;
  to?: string;
  comparison?: EvaluationsComparisonMode;
  stationId?: string | null;
  vehicleId?: string | null;
  vehicleClassId?: string | null;
  vehicleStatus?: EvaluationsVehicleStatus | null;
  bookingChannel?: string | null;
  bookingStatus?: EvaluationsBookingStatus | null;
  customerSegment?: EvaluationsCustomerSegment | null;
  currency?: string | null;
  riskCategory?: InsightAnalyticsCategory | null;
  insightStatus?: InsightAnalyticsSeverity | null;
  dataQualityStatus?: EvaluationsDataQualityStatus | null;
}

export interface EvaluationsAnalyticsPeriodBounds {
  key: EvaluationsAnalyticsPeriod | 'custom';
  from: string;
  to: string;
  timezone: string;
}

export interface ResolvedEvaluationsAnalyticsFilters {
  organizationId: string;
  period: EvaluationsAnalyticsPeriodBounds;
  comparisonPeriod: EvaluationsAnalyticsPeriodBounds;
  stationId: string | null;
  vehicleId: string | null;
  vehicleClassId: string | null;
  vehicleStatus: EvaluationsVehicleStatus | null;
  bookingStatus: EvaluationsBookingStatus | null;
  customerSegment: EvaluationsCustomerSegment | null;
  currency: string;
  riskCategory: InsightAnalyticsCategory | null;
  insightStatus: InsightAnalyticsSeverity | null;
  dataQualityStatus: EvaluationsDataQualityStatus | null;
  /** Intersection of station/vehicle/class/status scopes — null means no vehicle constraint. */
  scopedVehicleIds: ReadonlySet<string> | null;
  stationVehicleIds: ReadonlySet<string> | null;
}

/** Serializable filters returned in API responses (no internal sets). */
export interface EvaluationsAnalyticsAppliedFilters {
  period: EvaluationsAnalyticsPeriodBounds;
  comparisonPeriod: EvaluationsAnalyticsPeriodBounds;
  stationId: string | null;
  vehicleId: string | null;
  vehicleClassId: string | null;
  vehicleStatus: EvaluationsVehicleStatus | null;
  bookingStatus: EvaluationsBookingStatus | null;
  customerSegment: EvaluationsCustomerSegment | null;
  currency: string;
  riskCategory: InsightAnalyticsCategory | null;
  insightStatus: InsightAnalyticsSeverity | null;
  dataQualityStatus: EvaluationsDataQualityStatus | null;
}

export interface EvaluationsFilterValidationError {
  code: string;
  message: string;
  field?: string;
}
