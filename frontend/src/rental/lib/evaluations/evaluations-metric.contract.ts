/**
 * Re-exports the shared Auswertungen metric contract for frontend consumers.
 * Source of truth: shared/evaluations-metrics/
 */
export type {
  EvaluationsAggregationType,
  EvaluationsComparison,
  EvaluationsDataClassification,
  EvaluationsDimension,
  EvaluationsImplementationStatus,
  EvaluationsMetricCategory,
  EvaluationsMetricDefinition,
  EvaluationsMetricKind,
  EvaluationsMetricRegistrySnapshot,
  EvaluationsMetricUnit,
  EvaluationsValueType,
} from '@synq/evaluations-metrics/evaluations-metric.contract';

export {
  EVALUATIONS_AGGREGATION_TYPES,
  EVALUATIONS_COMPARISONS,
  EVALUATIONS_DATA_CLASSIFICATIONS,
  EVALUATIONS_DIMENSIONS,
  EVALUATIONS_IMPLEMENTATION_STATUSES,
  EVALUATIONS_METRIC_CATEGORIES,
  EVALUATIONS_METRIC_KINDS,
  EVALUATIONS_METRIC_UNITS,
  EVALUATIONS_VALUE_TYPES,
} from '@synq/evaluations-metrics/evaluations-metric.contract';

export {
  AUDIT_LEGACY_TO_EVALUATIONS_METRIC,
  BUSINESS_PULSE_TO_EVALUATIONS_METRIC,
  COCKPIT_PROP_LEGACY,
  INSIGHT_METRICS_FIELD_LEGACY,
  resolveLegacyEvaluationsMetricId,
} from '@synq/evaluations-metrics/evaluations-metric.legacy-map';

export {
  evaluationsMetricDescriptionKey,
  evaluationsMetricLabelKey,
} from '@synq/evaluations-metrics/evaluations-metric.i18n';

/** Primary financial KPI ids used by FinancialInsightsView (gradual registry adoption). */
export const FINANCIAL_INSIGHTS_REGISTRY_METRIC_IDS = {
  mtdIssuedRevenue: 'fin.mtd_issued_revenue',
  mtdPaidRevenue: 'fin.mtd_paid_revenue',
  mtdExpenses: 'fin.mtd_expenses',
  mtdNetResult: 'fin.mtd_net_result',
  profitMarginMtd: 'fin.profit_margin_mtd',
  openReceivables: 'fin.open_receivables',
  overdueReceivables: 'fin.overdue_receivables',
  momRevenueDeltaPct: 'fin.mom_revenue_delta_pct',
  momExpenseDeltaPct: 'fin.mom_expense_delta_pct',
} as const;

/** Insights cockpit KPI ids (gradual registry adoption). */
export const INSIGHTS_COCKPIT_REGISTRY_METRIC_IDS = {
  businessRisksCount: 'ins.business_risks_count',
  estimatedFinancialExposureEur: 'ins.estimated_financial_exposure_eur',
  criticalInsightsCount: 'ins.critical_insights_count',
  revenueLeakageCount: 'ins.revenue_leakage_count',
  recommendationsVisibleCount: 'ins.recommendations_visible_count',
} as const;
