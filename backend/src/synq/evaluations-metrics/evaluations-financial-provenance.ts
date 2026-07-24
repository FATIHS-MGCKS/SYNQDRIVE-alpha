import type { EvaluationsCalculationProvenance } from '@synq/evaluations-metrics/evaluations-calculation-provenance';
import {
  EVALUATIONS_CALCULATION_ENGINE_VERSION,
  buildCalculationProvenance,
} from '@synq/evaluations-metrics/evaluations-calculation-provenance';

export interface FinancialMtdProvenanceInput {
  metricId: string;
  calculationVersion: string;
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  organizationId: string;
  timezone: string;
  invoiceRowCount: number;
  currencyFilter: string;
  /** When true, result may omit rows (pagination, partial customer labels, etc.) */
  isPartial?: boolean;
}

export function buildFinancialMtdProvenance(
  input: FinancialMtdProvenanceInput,
): EvaluationsCalculationProvenance {
  return buildCalculationProvenance({
    metricId: input.metricId,
    calculationVersion: input.calculationVersion,
    generatedAt: input.generatedAt,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    appliedFilters: {
      organizationId: input.organizationId,
      currency: input.currencyFilter,
      period: 'MTD',
      timezone: input.timezone,
      revenueExcludedStatuses: ['DRAFT', 'CANCELLED', 'CANCELED', 'VOID', 'CREDITED'],
      expenseExcludedStatuses: ['DRAFT', 'CANCELLED', 'CANCELED', 'VOID', 'REJECTED'],
    },
    sourceVersions: {
      engineVersion: EVALUATIONS_CALCULATION_ENGINE_VERSION,
      computationLayer: 'client',
      dataSource: 'org_invoices',
      apiPath: 'GET /api/v1/organizations/:orgId/invoices',
      invoiceRowCount: input.invoiceRowCount,
      logicModule: 'financial-insights.logic.ts',
    },
    completeness: input.isPartial ? 'partial' : 'complete',
  });
}

export interface FinancialInsightsProvenanceBundle {
  mtdIssuedRevenue: EvaluationsCalculationProvenance;
  mtdPaidRevenue: EvaluationsCalculationProvenance;
  mtdExpenses: EvaluationsCalculationProvenance;
  mtdNetResult: EvaluationsCalculationProvenance;
  openReceivables: EvaluationsCalculationProvenance;
  overdueReceivables: EvaluationsCalculationProvenance;
}

export interface BuildFinancialInsightsProvenanceBundleInput {
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  organizationId: string;
  timezone: string;
  invoiceRowCount: number;
  calculationVersions: {
    mtdIssuedRevenue: string;
    mtdPaidRevenue: string;
    mtdExpenses: string;
    mtdNetResult: string;
    openReceivables: string;
    overdueReceivables: string;
  };
  isPartial?: boolean;
}

export function buildFinancialInsightsProvenanceBundle(
  input: BuildFinancialInsightsProvenanceBundleInput,
): FinancialInsightsProvenanceBundle {
  const base = {
    generatedAt: input.generatedAt,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    organizationId: input.organizationId,
    timezone: input.timezone,
    invoiceRowCount: input.invoiceRowCount,
    isPartial: input.isPartial,
    currencyFilter: 'EUR',
  };

  return {
    mtdIssuedRevenue: buildFinancialMtdProvenance({
      ...base,
      metricId: 'fin.mtd_issued_revenue',
      calculationVersion: input.calculationVersions.mtdIssuedRevenue,
    }),
    mtdPaidRevenue: buildFinancialMtdProvenance({
      ...base,
      metricId: 'fin.mtd_paid_revenue',
      calculationVersion: input.calculationVersions.mtdPaidRevenue,
    }),
    mtdExpenses: buildFinancialMtdProvenance({
      ...base,
      metricId: 'fin.mtd_expenses',
      calculationVersion: input.calculationVersions.mtdExpenses,
    }),
    mtdNetResult: buildFinancialMtdProvenance({
      ...base,
      metricId: 'fin.mtd_net_result',
      calculationVersion: input.calculationVersions.mtdNetResult,
    }),
    openReceivables: buildFinancialMtdProvenance({
      ...base,
      metricId: 'fin.open_receivables',
      calculationVersion: input.calculationVersions.openReceivables,
      periodStart: input.generatedAt,
      periodEnd: input.generatedAt,
    }),
    overdueReceivables: buildFinancialMtdProvenance({
      ...base,
      metricId: 'fin.overdue_receivables',
      calculationVersion: input.calculationVersions.overdueReceivables,
      periodStart: input.generatedAt,
      periodEnd: input.generatedAt,
    }),
  };
}
