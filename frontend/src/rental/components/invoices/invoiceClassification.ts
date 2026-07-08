import type { OrgInvoiceType } from './invoiceTypes';

/** Mirrors backend `invoice-domain.util.ts` outgoing types. */
export const OUTGOING_INVOICE_TYPES = [
  'OUTGOING_BOOKING',
  'OUTGOING_MANUAL',
  'OUTGOING_FINAL',
] as const satisfies readonly OrgInvoiceType[];

/** Mirrors backend `invoice-domain.util.ts` incoming types. */
export const INCOMING_INVOICE_TYPES = [
  'INCOMING_VENDOR',
  'INCOMING_UPLOADED',
] as const satisfies readonly OrgInvoiceType[];

const OUTGOING_TYPE_SET = new Set<string>(OUTGOING_INVOICE_TYPES);
const INCOMING_TYPE_SET = new Set<string>(INCOMING_INVOICE_TYPES);

/** Mirrors backend `REVENUE_EXCLUDED_STATUSES`. */
export const REVENUE_EXCLUDED_STATUSES = new Set([
  'DRAFT',
  'CANCELLED',
  'CANCELED',
  'VOID',
  'CREDITED',
]);

/** Mirrors backend `EXPENSE_EXCLUDED_STATUSES`. */
export const EXPENSE_EXCLUDED_STATUSES = new Set([
  'DRAFT',
  'CANCELLED',
  'CANCELED',
  'VOID',
  'REJECTED',
]);

/** Mirrors backend `NON_OPEN_OUTGOING_STATUSES`. */
export const NON_OPEN_OUTGOING_STATUSES = new Set(['DRAFT', 'CANCELLED', 'CANCELED', 'VOID', 'CREDITED']);

export interface InvoiceClassificationInput {
  type: string;
  status?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
}

export function normalizeInvoiceStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toUpperCase();
}

export function isOutgoingInvoice(type: string): boolean {
  return OUTGOING_TYPE_SET.has(type);
}

export function isIncomingInvoice(type: string): boolean {
  return INCOMING_TYPE_SET.has(type);
}

export function isRevenueInvoice(inv: InvoiceClassificationInput): boolean {
  return isOutgoingInvoice(inv.type) && !REVENUE_EXCLUDED_STATUSES.has(normalizeInvoiceStatus(inv.status));
}

export function isExpenseInvoice(inv: InvoiceClassificationInput): boolean {
  return isIncomingInvoice(inv.type) && !EXPENSE_EXCLUDED_STATUSES.has(normalizeInvoiceStatus(inv.status));
}

function parseDateMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function isPaidInvoice(inv: InvoiceClassificationInput): boolean {
  const status = normalizeInvoiceStatus(inv.status);
  return status === 'PAID' || !!inv.paidAt;
}

export function isReceivableInvoice(inv: InvoiceClassificationInput): boolean {
  if (!isOutgoingInvoice(inv.type)) return false;
  const status = normalizeInvoiceStatus(inv.status);
  if (NON_OPEN_OUTGOING_STATUSES.has(status)) return false;
  if (isPaidInvoice(inv)) return false;
  return true;
}

export function isOverdueReceivable(inv: InvoiceClassificationInput, now: Date = new Date()): boolean {
  if (!isReceivableInvoice(inv)) return false;
  const status = normalizeInvoiceStatus(inv.status);
  if (status === 'OVERDUE') return true;
  const dueMs = parseDateMs(inv.dueDate);
  return dueMs != null && dueMs < now.getTime();
}
