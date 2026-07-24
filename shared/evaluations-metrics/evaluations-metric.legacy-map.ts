/**
 * Legacy metric identifiers → canonical evaluations registry ids.
 * Use for gradual migration without breaking existing UI/runtime code.
 *
 * @see docs/architecture/analytics/evaluations-metric-registry.md
 */

/** Dashboard Business Pulse slice ids (dashboardRuntimeTypes.BusinessMetricId) */
export const BUSINESS_PULSE_TO_EVALUATIONS_METRIC: Readonly<Record<string, string>> = {
  revenue: 'fin.mtd_issued_revenue',
  profit: 'fin.mtd_net_result',
  expenses: 'fin.mtd_expenses',
  'open-receivables': 'fin.open_receivables',
  'overdue-receivables': 'fin.overdue_receivables',
  'paid-invoices': 'fin.mtd_paid_invoice_count',
  'draft-invoices': 'fin.mtd_open_invoice_count',
  'failed-payments': 'fin.org_invoice_count',
  'reserved-revenue': 'fin.reserved_revenue_mtd',
};

/** Audit / data-flow legacy metricIds from Prompt 1–2 */
export const AUDIT_LEGACY_TO_EVALUATIONS_METRIC: Readonly<Record<string, string>> = {
  'fin.mtd_profit': 'fin.mtd_net_result',
  'fin.profit_margin': 'fin.profit_margin_mtd',
  'fin.mom_revenue_delta': 'fin.mom_revenue_delta_pct',
  'fin.mom_expense_delta': 'fin.mom_expense_delta_pct',
  'fin.daily_chart': 'fin.daily_revenue_mtd',
  'fin.avg_invoice_mtd': 'fin.avg_invoice_value_mtd',
  'fin.mtd_expense_count': 'fin.mtd_expense_invoice_count',
  'fin.invoice_count_badge': 'fin.org_invoice_count',
  'fin.recent_activity': 'fin.recent_invoice_activity',
  'ins.estimated_financial_risk': 'ins.estimated_financial_exposure_eur',
  'ins.critical_bookings_count': 'ins.critical_insights_count',
  'ins.recommendations': 'ins.recommendations_visible_count',
  'ins.misuse_cases': 'ins.misuse_cases_visible_count',
  'ins.compliance_family': 'ins.service_overdue',
  'ins.health_gated': 'ins.battery_critical_gated',
  'da.telemetry_overview': 'da.telemetry_last_received',
};

/** Insight detector metric field legacy names */
export const INSIGHT_METRICS_FIELD_LEGACY: Readonly<Record<string, string>> = {
  lostRevenueEur: 'ins.low_utilization.revenue_potential_eur',
  financialImpactCents: 'ins.health_booking_financial_impact_eur',
};

/** Cockpit prop legacy names */
export const COCKPIT_PROP_LEGACY: Readonly<Record<string, string>> = {
  financialRiskEur: 'fin.overdue_receivables',
  openReceivablesEur: 'fin.open_receivables',
};

export function resolveLegacyEvaluationsMetricId(legacyId: string): string {
  return (
    BUSINESS_PULSE_TO_EVALUATIONS_METRIC[legacyId] ??
    AUDIT_LEGACY_TO_EVALUATIONS_METRIC[legacyId] ??
    legacyId
  );
}
