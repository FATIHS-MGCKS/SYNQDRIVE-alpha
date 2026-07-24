/**
 * Server-side financial KPI aggregation for Auswertungen metric responses.
 * Receivables rules: shared/receivables (outstanding balances, org timezone).
 */

import {
  EXPENSE_EXCLUDED_STATUSES,
  isIncomingInvoiceType,
  isOutgoingInvoiceType,
  REVENUE_EXCLUDED_STATUSES,
} from '@modules/invoices/invoice-domain.util';
import type { OrgInvoiceStatus } from '@prisma/client';
import { moneyFromMinor, sumMoney } from '@synq/money/money.util';
import {
  computeReceivablesAnalytics,
  filterOpenNotDueReceivables,
  filterOpenReceivables,
  filterOverdueReceivables,
  resolveOutstandingMinor,
} from '@synq/receivables/receivables-analytics';
import type {
  ReceivableInvoiceRow,
  ReceivablesAnalyticsResult,
} from '@synq/receivables/receivables-invoice.contract';

export type FinancialKpiInvoiceRow = ReceivableInvoiceRow & {
  subtotalCents?: number | null;
  taxCents?: number | null;
  updatedAt?: Date | string | null;
  cancelledAt?: Date | string | null;
  creditedAt?: Date | string | null;
};

export {
  computeReceivablesAnalytics,
  filterOpenNotDueReceivables,
  filterOpenReceivables,
  filterOverdueReceivables,
  resolveOutstandingMinor,
};
export { computeRevenueCashflowContribution } from '@synq/finance/revenue-cashflow-contribution';
export type { ReceivablesAnalyticsResult } from '@synq/receivables/receivables-invoice.contract';
export type { RevenueCashflowContributionResult } from '@synq/finance/revenue-cashflow-contribution.contract';

export function isEurInvoice(inv: FinancialKpiInvoiceRow): boolean {
  const c = (inv.currency ?? 'EUR').toUpperCase();
  return c === 'EUR' || c === '€';
}

export function effectiveInvoiceDate(inv: FinancialKpiInvoiceRow): Date | null {
  for (const value of [inv.invoiceDate, inv.createdAt]) {
    if (value == null) continue;
    const d = value instanceof Date ? value : new Date(String(value));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function normalizeStatus(status: string): string {
  return status.trim().toUpperCase();
}

export function isRevenueInvoice(inv: FinancialKpiInvoiceRow): boolean {
  if (!isOutgoingInvoiceType(inv.type)) return false;
  return !REVENUE_EXCLUDED_STATUSES.includes(normalizeStatus(inv.status) as OrgInvoiceStatus);
}

export function isExpenseInvoice(inv: FinancialKpiInvoiceRow): boolean {
  if (!isIncomingInvoiceType(inv.type)) return false;
  return !EXPENSE_EXCLUDED_STATUSES.includes(normalizeStatus(inv.status) as OrgInvoiceStatus);
}

/** @deprecated Use filterOpenReceivables — kept for callers expecting the old name. */
export function isReceivableInvoice(inv: FinancialKpiInvoiceRow): boolean {
  if (!isOutgoingInvoiceType(inv.type)) return false;
  const status = normalizeStatus(inv.status);
  return !['DRAFT', 'CANCELLED', 'CANCELED', 'VOID', 'CREDITED', 'PAID'].includes(status);
}

/** All open outgoing receivables (outstanding > 0, EUR). */
export function allOpenOutgoingReceivables(
  invoices: FinancialKpiInvoiceRow[],
  reportingCurrency = 'EUR',
): FinancialKpiInvoiceRow[] {
  return filterOpenReceivables(invoices, reportingCurrency);
}

/** Open receivables not yet due (org timezone). */
export function openNotDueOutgoingReceivables(
  invoices: FinancialKpiInvoiceRow[],
  reference: Date,
  timezone: string,
  reportingCurrency = 'EUR',
): FinancialKpiInvoiceRow[] {
  return filterOpenNotDueReceivables(invoices, reference, timezone, reportingCurrency);
}

/** Open receivables total — alias for allOpenOutgoingReceivables. */
export function openOutgoingReceivables(
  invoices: FinancialKpiInvoiceRow[],
  _reference?: Date,
  reportingCurrency = 'EUR',
): FinancialKpiInvoiceRow[] {
  return allOpenOutgoingReceivables(invoices, reportingCurrency);
}

export function overdueOutgoingReceivables(
  invoices: FinancialKpiInvoiceRow[],
  reference: Date,
  timezone = 'Europe/Berlin',
  reportingCurrency = 'EUR',
): FinancialKpiInvoiceRow[] {
  return filterOverdueReceivables(invoices, reference, timezone, reportingCurrency);
}

export function sumCents(rows: FinancialKpiInvoiceRow[], currency = 'EUR'): number {
  const amounts = rows
    .filter((row) => row.totalCents != null)
    .map((row) => moneyFromMinor(row.totalCents ?? 0, row.currency ?? currency));
  if (amounts.length === 0) return 0;
  return sumMoney(amounts).amountMinor;
}

export function sumOutstandingCents(rows: FinancialKpiInvoiceRow[], currency = 'EUR'): number {
  const amounts = rows.map((row) => moneyFromMinor(resolveOutstandingMinor(row), row.currency ?? currency));
  if (amounts.length === 0) return 0;
  return sumMoney(amounts, currency).amountMinor;
}

export function issuedRevenueInRange(
  invoices: FinancialKpiInvoiceRow[],
  from: Date,
  to: Date,
): FinancialKpiInvoiceRow[] {
  return invoices.filter((inv) => {
    if (!isRevenueInvoice(inv) || !isEurInvoice(inv)) return false;
    const d = effectiveInvoiceDate(inv);
    return d != null && d >= from && d <= to;
  });
}

export function paidRevenueInRange(
  invoices: FinancialKpiInvoiceRow[],
  from: Date,
  to: Date,
): FinancialKpiInvoiceRow[] {
  return invoices.filter((inv) => {
    if (!isRevenueInvoice(inv) || !isEurInvoice(inv)) return false;
    if (normalizeStatus(inv.status) !== 'PAID' || !inv.paidAt) return false;
    const d = inv.paidAt instanceof Date ? inv.paidAt : new Date(String(inv.paidAt));
    return !Number.isNaN(d.getTime()) && d >= from && d <= to;
  });
}

/** @deprecated Mixed union (issued ∪ paid) — use `computeRevenueCashflowContribution` for separated metrics. */
export function mtdRevenueInRange(
  invoices: FinancialKpiInvoiceRow[],
  from: Date,
  to: Date,
): FinancialKpiInvoiceRow[] {
  const byId = new Map<string, FinancialKpiInvoiceRow>();
  for (const row of [...issuedRevenueInRange(invoices, from, to), ...paidRevenueInRange(invoices, from, to)]) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

export function expensesInRange(
  invoices: FinancialKpiInvoiceRow[],
  from: Date,
  to: Date,
): FinancialKpiInvoiceRow[] {
  return invoices.filter((inv) => {
    if (!isExpenseInvoice(inv) || !isEurInvoice(inv)) return false;
    const d = effectiveInvoiceDate(inv);
    return d != null && d >= from && d <= to;
  });
}

export function latestInvoiceSourceAt(invoices: FinancialKpiInvoiceRow[]): Date | null {
  let latest: Date | null = null;
  for (const inv of invoices) {
    for (const raw of [inv.updatedAt, inv.createdAt]) {
      if (raw == null) continue;
      const d = raw instanceof Date ? raw : new Date(String(raw));
      if (Number.isNaN(d.getTime())) continue;
      if (!latest || d > latest) latest = d;
    }
  }
  return latest;
}

export const FINANCIAL_KPI_EXCLUSIONS = {
  revenue: REVENUE_EXCLUDED_STATUSES,
  expense: EXPENSE_EXCLUDED_STATUSES,
  nonEur: 'non_eur_currency_rows',
} as const;
