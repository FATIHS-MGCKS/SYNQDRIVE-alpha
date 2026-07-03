/** Pure financial aggregation helpers for the Insights cockpit (unit-testable). */

import {
  isIncomingInvoice,
  isOutgoingInvoice,
  isOverdueReceivable,
  isReceivableInvoice,
  isRevenueInvoice,
  isExpenseInvoice,
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
  const raw = inv.invoiceDate ?? inv.createdAt;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
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
    if (inv.status !== 'PAID' || !inv.paidAt) return false;
    const d = new Date(inv.paidAt);
    return !Number.isNaN(d.getTime()) && d >= from && d <= to;
  });
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
