import type { EvaluationsMetricResponse } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { EvaluationsPeriodWindow } from '@synq/evaluations-periods/evaluations-period.contract';

/**
 * Canonical E3 finance insights response
 * (`GET /organizations/:orgId/evaluations/finance/insights`).
 * The backend is the single authority for these values; the client only
 * formats/displays them.
 */
export interface FinancialInsightsBundleDto {
  readonly organizationId: string;
  readonly period: EvaluationsPeriodWindow;
  readonly metrics: Readonly<Record<string, EvaluationsMetricResponse>>;
}

/**
 * Build the canonical finance insights request path. A concrete selected station
 * is passed as a REQUESTED narrowing (`stationIds`); no station selected → no
 * station filter (org-wide, subject to backend E2 authorization). The client
 * never sets organization/currency/period/timezone as trusted authority.
 */
export function buildFinanceInsightsPath(orgId: string, stationIds?: readonly string[]): string {
  const cleaned = (stationIds ?? []).map((s) => s.trim()).filter((s) => s.length > 0);
  const qs = cleaned.length ? `?stationIds=${encodeURIComponent(cleaned.join(','))}` : '';
  return `/organizations/${orgId}/evaluations/finance/insights${qs}`;
}

/** Canonical core finance metric ids served by the endpoint. */
export const FINANCE_CORE_METRIC_IDS = {
  issuedRevenue: 'fin.mtd_issued_revenue',
  paidRevenue: 'fin.mtd_paid_revenue',
  expenses: 'fin.mtd_expenses',
  netResult: 'fin.mtd_net_result',
  profitMargin: 'fin.profit_margin_mtd',
  openReceivables: 'fin.open_receivables',
  overdueReceivables: 'fin.overdue_receivables',
  totalOutstanding: 'fin.total_outstanding_receivables',
} as const;
