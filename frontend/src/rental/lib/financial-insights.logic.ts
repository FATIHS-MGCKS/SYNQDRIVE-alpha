/**
 * Financial Insights serving-path adapter (Insights cockpit).
 *
 * E3.1: this module no longer owns any independent finance formula. It is a thin
 * ADAPTER that delegates classification and money arithmetic to the canonical E3
 * authority (`@synq/evaluations-finance`). It selects/maps rows for the legacy,
 * EUR-scoped presentation the cockpit already renders and returns the SAME shapes
 * the UI consumes, but every amount is summed with the canonical BigInt money
 * arithmetic and every include/exclude decision uses the canonical fact
 * classification. Receivable amounts use the authoritative outstanding balance.
 */
import {
  isIncomingInvoice,
  isOutgoingInvoice,
  isOverdueReceivable,
  isReceivableInvoice,
  isRevenueInvoice,
  isExpenseInvoice,
  normalizeInvoiceStatus,
} from '../components/invoices/invoiceClassification';
import type { EvaluationsInvoiceFact } from '@synq/evaluations-finance/evaluations-finance-facts';
import {
  isExpenseInvoiceFact,
  isRevenueInvoiceFact,
  isWithinWindow,
  resolveExpenseBusinessMs,
  resolveRevenueBusinessMs,
} from '@synq/evaluations-finance/evaluations-finance-facts';
import {
  computeCurrentTotalReceivables,
  computeOverdueReceivables,
} from '@synq/evaluations-finance/evaluations-finance-calculator';
import { moneyOfMinor, sumMoney } from '@synq/evaluations-finance/evaluations-money';

export interface InvoiceSlice {
  id: string;
  type: string;
  status: string;
  totalCents: number | null;
  /** Authoritative current outstanding balance (E3.1 receivable authority). */
  outstandingCents?: number | null;
  paidCents?: number | null;
  currency: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  paidAt: string | null;
  /** Finalization instant (revenue business time) when available. */
  issuedAt?: string | null;
  createdAt: string | null;
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
};

/** Legacy EUR presentation scope (explicit): missing/blank currency is NOT EUR. */
export function isEurInvoice(inv: InvoiceSlice): boolean {
  const c = (inv.currency ?? '').trim().toUpperCase();
  return c === 'EUR' || c === '€';
}

/** Map a presentation invoice slice to a canonical finance fact (EUR-scoped). */
function toEurFact(inv: InvoiceSlice): EvaluationsInvoiceFact {
  const total = inv.totalCents ?? 0;
  const paid = inv.paidCents ?? 0;
  const outstanding =
    inv.outstandingCents != null ? inv.outstandingCents : Math.max(0, total - paid);
  return {
    id: inv.id,
    direction: isIncomingInvoice(inv.type) ? 'INCOMING' : 'OUTGOING',
    status: inv.status,
    currency: 'EUR',
    totalMinor: total,
    paidMinor: paid,
    outstandingMinor: outstanding,
    issuedAt: inv.issuedAt ?? null,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    paidAt: inv.paidAt,
    createdAt: inv.createdAt,
  };
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

/** Sum invoice totals with canonical BigInt money arithmetic (EUR presentation). */
export function sumCents<T extends InvoiceSlice>(rows: T[]): number {
  if (rows.length === 0) return 0;
  return sumMoney(rows.map((r) => moneyOfMinor(r.totalCents ?? 0, 'EUR'))).amountMinor;
}

export function openOutgoingReceivables<T extends InvoiceSlice>(invoices: T[], now: Date): T[] {
  return invoices.filter((inv) => isReceivableInvoice(inv) && isEurInvoice(inv) && !isOverdueReceivable(inv, now));
}

export function overdueOutgoingReceivables<T extends InvoiceSlice>(invoices: T[], now: Date): T[] {
  return invoices.filter((inv) => isReceivableInvoice(inv) && isEurInvoice(inv) && isOverdueReceivable(inv, now));
}

/**
 * Canonical CURRENT open (not-overdue) receivable total in minor units, using the
 * authoritative outstanding balance (never `totalCents`). EUR presentation scope.
 */
export function currentOpenReceivablesMinor(invoices: InvoiceSlice[], now: Date): number {
  const facts = invoices.filter(isEurInvoice).map(toEurFact);
  const total = computeCurrentTotalReceivables(facts);
  const overdue = computeOverdueReceivables(facts, now.getTime());
  const totalMinor = total.perCurrency[0]?.amountMinor ?? 0;
  const overdueMinor = overdue.perCurrency[0]?.amountMinor ?? 0;
  return Math.max(0, totalMinor - overdueMinor);
}

/** Canonical CURRENT overdue receivable total (authoritative outstanding). */
export function currentOverdueReceivablesMinor(invoices: InvoiceSlice[], now: Date): number {
  const facts = invoices.filter(isEurInvoice).map(toEurFact);
  return computeOverdueReceivables(facts, now.getTime()).perCurrency[0]?.amountMinor ?? 0;
}

/** Canonical CURRENT total outstanding receivable (open + overdue). */
export function currentTotalReceivablesMinor(invoices: InvoiceSlice[]): number {
  const facts = invoices.filter(isEurInvoice).map(toEurFact);
  return computeCurrentTotalReceivables(facts).perCurrency[0]?.amountMinor ?? 0;
}

export function issuedRevenueInRange<T extends InvoiceSlice>(
  invoices: T[],
  from: Date,
  to: Date,
): T[] {
  const fromMs = from.getTime();
  const toMsInclusive = to.getTime() + 1;
  return invoices.filter((inv) => {
    if (!isEurInvoice(inv)) return false;
    const fact = toEurFact(inv);
    if (!isRevenueInvoiceFact(fact)) return false;
    return isWithinWindow(resolveRevenueBusinessMs(fact), fromMs, toMsInclusive);
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
    const d = new Date(inv.paidAt);
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

/** Dashboard MTD revenue (Option A) — issued outgoing + cash collected in range; no DRAFT. */
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
  const ms = Date.parse(inv.createdAt);
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
  const fromMs = from.getTime();
  const toMsInclusive = to.getTime() + 1;
  return invoices.filter((inv) => {
    if (!isEurInvoice(inv)) return false;
    const fact = toEurFact(inv);
    if (!isExpenseInvoiceFact(fact)) return false;
    return isWithinWindow(resolveExpenseBusinessMs(fact), fromMs, toMsInclusive);
  });
}
