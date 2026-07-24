/**
 * Typed evaluations analytics API contracts for the frontend (Prompt 20/54).
 * Re-exports shared types — single import surface for api.ts and hooks.
 */
export type { InsightAnalyticsSummary } from '@synq/evaluations-insights/insights-analytics.contract';
export type { EvaluationsAnalyticsSummaryResponse } from '@synq/evaluations-insights/evaluations-analytics-summary.contract';
export type {
  EvaluationsInsightDetail,
  EvaluationsInsightListResponse,
} from '@synq/evaluations-insights/evaluations-insight-detail.contract';
export {
  validateInsightAnalyticsSummary,
  validateEvaluationsInsightListResponse,
  validateEvaluationsAnalyticsSummaryResponse,
} from '@synq/evaluations-insights/evaluations-analytics-contract-validation';

/** @deprecated Use EvaluationsInsightDetail */
export type { EvaluationsInsightDetail as EvaluationsInsightListItem } from '@synq/evaluations-insights/evaluations-insight-detail.contract';

/** @deprecated Use InsightAnalyticsSummary */
export type { InsightAnalyticsSummary as EvaluationsInsightsSummary } from '@synq/evaluations-insights/insights-analytics.contract';
