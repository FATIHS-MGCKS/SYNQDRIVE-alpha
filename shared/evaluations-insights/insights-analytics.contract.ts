/**
 * Shared contracts for Auswertungen insight analytics (Prompt 15/54).
 * Summary and detail list endpoints use the same filter definitions.
 */

export type InsightAnalyticsCategory =
  | 'BUSINESS_RISK'
  | 'REVENUE_LEAKAGE'
  | 'OPERATIONAL_RECOMMENDATION';

export type InsightAnalyticsSeverity = 'CRITICAL' | 'WARNING' | 'OPPORTUNITY' | 'INFO';

export type InsightAnalyticsSortField = 'priority' | 'createdAt';
export type InsightAnalyticsSortOrder = 'asc' | 'desc';

export interface InsightAnalyticsRow {
  id: string;
  type: string;
  severity: string;
  priority: number;
  entityIds?: string[] | null;
  metrics?: Record<string, unknown> | null;
  timeContext?: Record<string, string> | null;
  createdAt?: string | Date;
}

export interface InsightAnalyticsFilters {
  category?: InsightAnalyticsCategory;
  severity?: InsightAnalyticsSeverity;
  stationId?: string | null;
  /** Vehicle ids belonging to stationId — resolved server-side when station filter is set. */
  stationVehicleIds?: ReadonlySet<string> | null;
}

export interface InsightAnalyticsListQuery extends InsightAnalyticsFilters {
  page?: number;
  limit?: number;
  sortBy?: InsightAnalyticsSortField;
  sortOrder?: InsightAnalyticsSortOrder;
}

export interface InsightAnalyticsSummaryCounts {
  totalVisible: number;
  businessRisks: number;
  revenueLeakage: number;
  criticalInsights: number;
  criticalBusinessRisks: number;
  recommended: number;
  bySeverity: {
    critical: number;
    warning: number;
    opportunity: number;
    info: number;
  };
}

export interface InsightAnalyticsSummary {
  generatedAt: string | null;
  hasRun: boolean;
  lastRunAt: string | null;
  stale: boolean;
  error: string | null;
  counts: InsightAnalyticsSummaryCounts;
  /** Whole major units — insight exposure estimate from visible business + leakage insights. */
  estimatedFinancialExposureMinor: number;
  estimatedFinancialExposureCurrency: string;
  appliedFilters: InsightAnalyticsFilters;
}
