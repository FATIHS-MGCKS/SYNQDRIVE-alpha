import {
  InvoiceDisplayStatus,
  mapInvoiceStatusToLabel,
  mapInvoiceStatusToTone,
} from '../../../lib/billing-domain';

export type MasterInvoiceFilter =
  | 'all'
  | 'open'
  | 'paid'
  | 'failed'
  | 'overdue'
  | 'void'
  | 'uncollectible'
  | 'refunded'
  | 'partially_refunded'
  | 'credit_notes';

export const MASTER_INVOICE_FILTERS: Array<{ id: MasterInvoiceFilter; label: string }> = [
  { id: 'all', label: 'Alle' },
  { id: 'open', label: 'Offen' },
  { id: 'paid', label: 'Bezahlt' },
  { id: 'failed', label: 'Fehlgeschlagen' },
  { id: 'overdue', label: 'Überfällig' },
  { id: 'void', label: 'Storniert' },
  { id: 'uncollectible', label: 'Uneinbringlich' },
  { id: 'partially_refunded', label: 'Teilerstattet' },
  { id: 'refunded', label: 'Vollerstattet' },
];

export function masterInvoiceFilterToQuery(filter: MasterInvoiceFilter): Record<string, string> {
  switch (filter) {
    case 'open':
      return { displayStatus: 'OPEN' };
    case 'paid':
      return { displayStatus: 'PAID' };
    case 'failed':
      return { displayStatus: 'FAILED' };
    case 'overdue':
      return { displayStatus: 'OVERDUE' };
    case 'void':
      return { displayStatus: 'VOID' };
    case 'uncollectible':
      return { displayStatus: 'UNCOLLECTIBLE' };
    case 'refunded':
      return { displayStatus: 'REFUNDED' };
    case 'partially_refunded':
      return { displayStatus: 'PARTIALLY_REFUNDED' };
    default:
      return {};
  }
}

export function resolveInvoiceDisplayStatus(
  invoice: {
    status: string;
    displayStatus?: string | null;
    dueDate?: string | null;
  },
): string {
  if (invoice.displayStatus) return invoice.displayStatus;
  if (invoice.status === 'OPEN' && invoice.dueDate) {
    const due = new Date(invoice.dueDate);
    if (!Number.isNaN(due.getTime()) && due < new Date()) {
      return InvoiceDisplayStatus.OVERDUE;
    }
  }
  return invoice.status;
}

export function invoiceDisplayStatusLabel(status: string): string {
  if (status === 'OVERDUE') return 'Überfällig';
  if (status === 'PARTIALLY_REFUNDED') return 'Teilerstattet';
  if (status === 'REFUNDED') return 'Vollerstattet';
  if (status === 'FAILED') return 'Fehlgeschlagen';
  if (status === 'UNCOLLECTIBLE') return 'Uneinbringlich';
  if (status === 'OPEN' || status === 'PENDING') return 'Offen';
  return mapInvoiceStatusToLabel(status);
}

export function invoiceDisplayStatusTone(status: string): string {
  if (status === 'OVERDUE' || status === 'FAILED' || status === 'UNCOLLECTIBLE') {
    return 'sq-tone-critical';
  }
  if (status === 'PAID') return 'sq-tone-success';
  if (status === 'VOID') return 'sq-tone-neutral';
  if (status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED') return 'sq-tone-info';
  return mapInvoiceStatusToTone(status);
}

export function isSafeExternalUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function stripeDashboardInvoiceUrl(
  stripeInvoiceId: string | null | undefined,
  mode: 'TEST' | 'LIVE' | string | null | undefined,
): string | null {
  if (!stripeInvoiceId?.trim()) return null;
  const prefix = mode === 'LIVE' ? '' : 'test/';
  return `https://dashboard.stripe.com/${prefix}invoices/${stripeInvoiceId}`;
}

export function stripeDashboardPaymentUrl(
  stripePaymentIntentId: string | null | undefined,
  mode: 'TEST' | 'LIVE' | string | null | undefined,
): string | null {
  if (!stripePaymentIntentId?.trim()) return null;
  const prefix = mode === 'LIVE' ? '' : 'test/';
  return `https://dashboard.stripe.com/${prefix}payments/${stripePaymentIntentId}`;
}

export function createManualPaymentIdempotencyKey(invoiceId: string): string {
  return `master-manual-payment:${invoiceId}:${Date.now()}`;
}

export function formatAttemptCount(count: number | null | undefined): string {
  if (count == null || count <= 0) return '0';
  return String(count);
}
