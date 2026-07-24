/**
 * Shared contracts for Auswertungen insight analytics (Prompt 15/54).
 * Summary and detail list endpoints use the same filter definitions.
 */

import type { InsightEntityCountSummary } from './insight-entity-references.contract';

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
  entityScope?: string | null;
  entityIds?: string[] | null;
  isGrouped?: boolean;
  groupCount?: number;
  organizationId?: string;
  entityReferences?: import('./insight-entity-references.contract').InsightEntityReference[] | null;
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
  /** Visible insight groups (rows), not individual events. */
  totalVisible: number;
  businessRisks: number;
  revenueLeakage: number;
  criticalInsights: number;
  /** Unique CRITICAL booking entities — not insight groups. */
  criticalBookings: number;
  /** @deprecated Use criticalBookings — kept for backward-compatible API clients. */
  criticalBusinessRisks: number;
  recommended: number;
  bySeverity: {
    critical: number;
    warning: number;
    opportunity: number;
    info: number;
  };
  entities: InsightEntityCountSummary;
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
