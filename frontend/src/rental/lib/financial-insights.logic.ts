/** Pure financial aggregation helpers for the Insights cockpit (unit-testable). */

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

const OUTGOING = new Set(['OUTGOING_BOOKING', 'OUTGOING_MANUAL']);
const INCOMING = new Set(['INCOMING_VENDOR', 'INCOMING_UPLOADED']);

export function isOutgoingInvoice(type: string): boolean {
  return OUTGOING.has(type);
}

export function isIncomingInvoice(type: string): boolean {
  return INCOMING.has(type);
}

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

export function openOutgoingReceivables<T extends InvoiceSlice>(invoices: T[], _now: Date): T[] {
  return invoices.filter((inv) => {
    if (!isOutgoingInvoice(inv.type) || !isEurInvoice(inv)) return false;
    if (inv.status === 'PAID' || inv.status === 'CANCELLED') return false;
    return true;
  });
}

export function overdueOutgoingReceivables<T extends InvoiceSlice>(invoices: T[], now: Date): T[] {
  return openOutgoingReceivables(invoices, now).filter((inv) => {
    if (!inv.dueDate) return inv.status === 'OVERDUE';
    const due = new Date(inv.dueDate);
    return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
  });
}

export function issuedRevenueInRange<T extends InvoiceSlice>(
  invoices: T[],
  from: Date,
  to: Date,
): T[] {
  return invoices.filter((inv) => {
    if (!isOutgoingInvoice(inv.type) || !isEurInvoice(inv)) return false;
    if (inv.status === 'CANCELLED' || inv.status === 'DRAFT') return false;
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
    if (!isOutgoingInvoice(inv.type) || !isEurInvoice(inv)) return false;
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
    if (!isIncomingInvoice(inv.type) || !isEurInvoice(inv)) return false;
    if (inv.status === 'CANCELLED' || inv.status === 'DRAFT') return false;
    const d = effectiveInvoiceDate(inv);
    return d != null && d >= from && d <= to;
  });
}
