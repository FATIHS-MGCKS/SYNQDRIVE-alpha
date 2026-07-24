/**
 * Public insight detail contract for evaluations list/detail APIs (Prompt 20/54).
 */
import type { InsightAnalyticsSeverity } from './insights-analytics.contract';
import type { InsightEntityBreakdown, InsightEntityReference } from './insight-entity-references.contract';
import type { EvaluationsAnalyticsAppliedFilters } from './evaluations-analytics-filters.contract';
import type { EvaluationsPaginationMeta } from './evaluations-analytics-primitives.contract';

export interface EvaluationsInsightDetail {
  id: string;
  type: string;
  severity: InsightAnalyticsSeverity | string;
  priority: number;
  title: string;
  message: string;
  actionLabel?: string | null;
  actionType?: string | null;
  entityScope: string;
  entityIds?: string[] | null;
  timeContext?: Record<string, string> | null;
  metrics?: Record<string, unknown> | null;
  reasons?: string[] | null;
  isGrouped: boolean;
  groupCount: number;
  entityReferences?: InsightEntityReference[] | null;
  entityBreakdown?: InsightEntityBreakdown | null;
  createdAt: string;
}

export interface EvaluationsInsightListResponse {
  data: EvaluationsInsightDetail[];
  meta: EvaluationsPaginationMeta;
  appliedFilters: EvaluationsAnalyticsAppliedFilters;
}
