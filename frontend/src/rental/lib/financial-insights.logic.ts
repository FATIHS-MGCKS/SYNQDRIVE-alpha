/** Pure financial aggregation helpers for the Insights cockpit (unit-testable). */

import {
  computeReceivablesAnalytics,
  filterOpenNotDueReceivables,
  filterOpenReceivables,
  filterOverdueReceivables,
  resolveOutstandingMinor,
} from '@synq/receivables/receivables-analytics';
import type { ReceivablesAnalyticsResult } from '@synq/receivables/receivables-invoice.contract';
import { computeRevenueCashflowContribution } from '@synq/finance/revenue-cashflow-contribution';
import type { RevenueCashflowContributionResult } from '@synq/finance/revenue-cashflow-contribution.contract';
import { moneyFromMinor, sumMoney } from '@synq/money/money.util';

import {
  isIncomingInvoice,
  isOutgoingInvoice,
  isOverdueReceivable,
  isReceivableInvoice,
  isRevenueInvoice,
  isExpenseInvoice,
  normalizeInvoiceStatus,
} from '../components/invoices/invoiceClassification';

export interface InvoiceSlice {
  id: string;
  type: string;
  status: string;
  totalCents: number | null;
  subtotalCents?: number | null;
  taxCents?: number | null;
  paidCents?: number | null;
  outstandingCents?: number | null;
  currency: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string | null;
  cancelledAt?: string | null;
  creditedAt?: string | null;
  customerId?: string | null;
  vehicleId?: string | null;
  bookingId?: string | null;
}

export {
  isIncomingInvoice,
  isOutgoingInvoice,
  isOverdueReceivable,
  isReceivableInvoice,
  isRevenueInvoice,
  isExpenseInvoice,
  computeReceivablesAnalytics,
  computeRevenueCashflowContribution,
  resolveOutstandingMinor,
};
export type { ReceivablesAnalyticsResult, RevenueCashflowContributionResult };

export function isEurInvoice(inv: InvoiceSlice): boolean {
  const c = (inv.currency ?? 'EUR').toUpperCase();
  return c === 'EUR' || c === '€';
}

export function effectiveInvoiceDate(inv: InvoiceSlice): Date | null {
  for (const value of [inv.invoiceDate, inv.createdAt]) {
    if (value == null) continue;
    const trimmed = String(value).trim();
    if (!trimmed) continue;
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export function sumCents<T extends InvoiceSlice>(rows: T[]): number {
  return rows.reduce((acc, r) => acc + (r.totalCents ?? 0), 0);
}

export function sumOutstandingCents<T extends InvoiceSlice>(rows: T[], currency = 'EUR'): number {
  const amounts = rows.map((row) => moneyFromMinor(resolveOutstandingMinor(row), row.currency ?? currency));
  if (amounts.length === 0) return 0;
  return sumMoney(amounts, currency).amountMinor;
}

/** All open outgoing receivables (outstanding balance, EUR). */
export function allOpenOutgoingReceivables<T extends InvoiceSlice>(
  invoices: T[],
  reportingCurrency = 'EUR',
): T[] {
  return filterOpenReceivables(invoices, reportingCurrency) as T[];
}

/** Open receivables not yet due (org timezone). */
export function openNotDueOutgoingReceivables<T extends InvoiceSlice>(
  invoices: T[],
  reference: Date,
  timezone: string,
  reportingCurrency = 'EUR',
): T[] {
  return filterOpenNotDueReceivables(invoices, reference, timezone, reportingCurrency) as T[];
}

/** Open receivables total (includes overdue). */
export function openOutgoingReceivables<T extends InvoiceSlice>(
  invoices: T[],
  _reference?: Date,
  reportingCurrency = 'EUR',
): T[] {
  return allOpenOutgoingReceivables(invoices, reportingCurrency);
}

export function overdueOutgoingReceivables<T extends InvoiceSlice>(
  invoices: T[],
  reference: Date,
  timezone = 'Europe/Berlin',
  reportingCurrency = 'EUR',
): T[] {
  return filterOverdueReceivables(invoices, reference, timezone, reportingCurrency) as T[];
}

export function issuedRevenueInRange<T extends InvoiceSlice>(
  invoices: T[],
  from: Date,
  to: Date,
): T[] {
  return invoices.filter((inv) => {
    if (!isRevenueInvoice(inv) || !isEurInvoice(inv)) return false;
    const d = effectiveInvoiceDate(inv);
    return d != null && d >= from && d <= to;
  });
}

export function paidRevenueInRange<T extends InvoiceSlice>(
  invoices: T[],
  from: Date,
  to: Date,
): T[] {
  return invoices.filter((inv) => {
    if (!isRevenueInvoice(inv) || !isEurInvoice(inv)) return false;
    if (normalizeInvoiceStatus(inv.status) !== 'PAID' || !inv.paidAt) return false;
    const d = new Date(String(inv.paidAt));
    return !Number.isNaN(d.getTime()) && d >= from && d <= to;
  });
}

/**
 * Prepaid rental bookings often keep an OUTGOING_BOOKING invoice in DRAFT until
 * handover/finalization — tracked separately as reserved revenue, not MTD Umsatz.
 */
export function preIssuedBookingRevenueInRange<T extends InvoiceSlice & { type?: string }>(
  invoices: T[],
  from: Date,
  to: Date,
): T[] {
  return invoices.filter((inv) => {
    if (inv.type !== 'OUTGOING_BOOKING') return false;
    if (normalizeInvoiceStatus(inv.status) !== 'DRAFT') return false;
    if (!isEurInvoice(inv)) return false;
    const d = effectiveInvoiceDate(inv);
    if (d == null || d < from || d > to) return false;
    return (inv.totalCents ?? 0) > 0;
  });
}

/** @deprecated Mixed union (issued ∪ paid) — use `computeRevenueCashflowContribution` for separated metrics. */
export function mtdRevenueInRange<T extends InvoiceSlice>(
  invoices: T[],
  from: Date,
  to: Date,
): T[] {
  const byId = new Map<string, T>();
  for (const row of [
    ...issuedRevenueInRange(invoices, from, to),
    ...paidRevenueInRange(invoices, from, to),
  ]) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

function createdAtMs(inv: InvoiceSlice): number {
  if (!inv.createdAt) return 0;
  const ms = Date.parse(String(inv.createdAt));
  return Number.isFinite(ms) ? ms : 0;
}

/** Reserved revenue — prepaid OUTGOING_BOOKING drafts in range, one row per bookingId. */
export function reservedRevenueInRange<T extends InvoiceSlice & { type?: string; bookingId?: string | null }>(
  invoices: T[],
  from: Date,
  to: Date,
): T[] {
  const drafts = preIssuedBookingRevenueInRange(invoices, from, to);
  const byBooking = new Map<string, T>();
  const withoutBooking: T[] = [];

  for (const row of drafts) {
    const bookingId = row.bookingId?.trim();
    if (!bookingId) {
      withoutBooking.push(row);
      continue;
    }
    const existing = byBooking.get(bookingId);
    if (!existing || createdAtMs(row) >= createdAtMs(existing)) {
      byBooking.set(bookingId, row);
    }
  }

  return [...byBooking.values(), ...withoutBooking];
}

export function expensesInRange<T extends InvoiceSlice>(
  invoices: T[],
  from: Date,
  to: Date,
): T[] {
  return invoices.filter((inv) => {
    if (!isExpenseInvoice(inv) || !isEurInvoice(inv)) return false;
    const d = effectiveInvoiceDate(inv);
    return d != null && d >= from && d <= to;
  });
}
