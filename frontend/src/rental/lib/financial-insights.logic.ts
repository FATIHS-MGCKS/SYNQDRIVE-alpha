/** Pure financial aggregation helpers for the Insights cockpit (unit-testable). */

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
  currency: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  paidAt: string | null;
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

export function openOutgoingReceivables<T extends InvoiceSlice>(invoices: T[], now: Date): T[] {
  return invoices.filter((inv) => isReceivableInvoice(inv) && isEurInvoice(inv) && !isOverdueReceivable(inv, now));
}

export function overdueOutgoingReceivables<T extends InvoiceSlice>(invoices: T[], now: Date): T[] {
  return invoices.filter((inv) => isReceivableInvoice(inv) && isEurInvoice(inv) && isOverdueReceivable(inv, now));
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
  return invoices.filter((inv) => {
    if (!isExpenseInvoice(inv) || !isEurInvoice(inv)) return false;
    const d = effectiveInvoiceDate(inv);
    return d != null && d >= from && d <= to;
  });
}
