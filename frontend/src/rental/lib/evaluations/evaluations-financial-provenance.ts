/**
 * Client-side financial KPI calculation provenance (Auswertungen).
 * Re-exports shared builders; UI wiring follows in later prompts.
 */
export {
  buildFinancialInsightsProvenanceBundle,
  buildFinancialMtdProvenance,
  type BuildFinancialInsightsProvenanceBundleInput,
  type FinancialInsightsProvenanceBundle,
  type FinancialMtdProvenanceInput,
} from '@synq/evaluations-metrics/evaluations-financial-provenance';

export {
  buildCalculationProvenance,
  parseCalculationProvenance,
  wrapCalculationResult,
  type EvaluationsCalculationProvenance,
  type EvaluationsCalculationResultEnvelope,
} from '@synq/evaluations-metrics/evaluations-calculation-provenance';

import { FINANCIAL_INSIGHTS_REGISTRY_METRIC_IDS } from './evaluations-metric.contract';
import { requireEvaluationsMetricDefinition } from './evaluations-metric-registry';
import { buildFinancialInsightsProvenanceBundle } from '@synq/evaluations-metrics/evaluations-financial-provenance';

/** Resolve registry calculation versions for primary financial MTD KPIs. */
export function resolveFinancialInsightsCalculationVersions() {
  return {
    mtdIssuedRevenue: requireEvaluationsMetricDefinition(
      FINANCIAL_INSIGHTS_REGISTRY_METRIC_IDS.mtdIssuedRevenue,
    ).calculationVersion,
    mtdPaidRevenue: requireEvaluationsMetricDefinition(
      FINANCIAL_INSIGHTS_REGISTRY_METRIC_IDS.mtdPaidRevenue,
    ).calculationVersion,
    mtdExpenses: requireEvaluationsMetricDefinition(
      FINANCIAL_INSIGHTS_REGISTRY_METRIC_IDS.mtdExpenses,
    ).calculationVersion,
    mtdNetResult: requireEvaluationsMetricDefinition(
      FINANCIAL_INSIGHTS_REGISTRY_METRIC_IDS.mtdNetResult,
    ).calculationVersion,
    openReceivables: requireEvaluationsMetricDefinition(
      FINANCIAL_INSIGHTS_REGISTRY_METRIC_IDS.openReceivables,
    ).calculationVersion,
    overdueReceivables: requireEvaluationsMetricDefinition(
      FINANCIAL_INSIGHTS_REGISTRY_METRIC_IDS.overdueReceivables,
    ).calculationVersion,
  };
}

export function buildDefaultFinancialInsightsProvenanceBundle(input: {
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  organizationId: string;
  timezone: string;
  invoiceRowCount: number;
  isPartial?: boolean;
}) {
  return buildFinancialInsightsProvenanceBundle({
    ...input,
    calculationVersions: resolveFinancialInsightsCalculationVersions(),
  });
}
