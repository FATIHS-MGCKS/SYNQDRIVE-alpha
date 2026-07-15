import type {
  TenantInvoiceListItemDto,
  TenantInvoicePaymentHistoryDto,
  TenantPaymentAttemptDto,
} from '../../types/billing.types';

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Ausstehend',
  SUCCEEDED: 'Erfolgreich',
  FAILED: 'Zahlung fehlgeschlagen',
  REFUNDED: 'Erstattet',
  PARTIALLY_REFUNDED: 'Teilweise erstattet',
  CANCELLED: 'Storniert',
};

const INVOICE_STATUS_FALLBACK: Record<string, string> = {
  DRAFT: 'Entwurf',
  OPEN: 'Offen',
  PAID: 'Bezahlt',
  VOID: 'Storniert',
  UNCOLLECTIBLE: 'Uneinbringlich',
  OVERDUE: 'Überfällig',
};

export function resolveTenantInvoiceStatusLabel(invoice: {
  status?: string | null;
  statusLabel?: string | null;
  dueDate?: string | null;
}): string {
  if (invoice.statusLabel?.trim()) return invoice.statusLabel.trim();
  const status = (invoice.status ?? '').toUpperCase();
  if (status === 'OPEN' && invoice.dueDate && new Date(invoice.dueDate) < new Date()) {
    return 'Überfällig';
  }
  return INVOICE_STATUS_FALLBACK[status] ?? 'Offen';
}

export function tenantInvoiceStatusTone(statusLabel: string): string {
  const normalized = statusLabel.toLowerCase();
  if (normalized.includes('bezahlt') || normalized.includes('erstattet')) {
    return normalized.includes('teilweise') ? 'sq-tone-info' : 'sq-tone-success';
  }
  if (normalized.includes('storniert') || normalized.includes('entwurf')) {
    return 'sq-tone-neutral';
  }
  if (
    normalized.includes('überfällig') ||
    normalized.includes('fehlgeschlagen') ||
    normalized.includes('uneinbringlich')
  ) {
    return 'sq-tone-critical';
  }
  return 'sq-tone-warning';
}

export function resolvePaymentStatusLabel(status: string, statusLabel?: string | null): string {
  if (statusLabel?.trim()) return statusLabel.trim();
  return PAYMENT_STATUS_LABELS[status.toUpperCase()] ?? 'Zahlung';
}

export function formatOpenAmount(invoice: TenantInvoiceListItemDto): string {
  return invoice.amountRemaining?.formatted ?? invoice.amountDue?.formatted ?? '—';
}

export function hasPaymentProblem(history: TenantInvoicePaymentHistoryDto | null): boolean {
  if (!history) return false;
  return (
    history.failedAttempts.length > 0 ||
    history.payments.some((payment) => payment.status === 'FAILED') ||
    (history.amountRemaining.cents > 0 &&
      history.payments.some((payment) =>
        payment.attempts.some((attempt) => attempt.status === 'FAILED'),
      ))
  );
}

export function summarizeFailedAttempt(attempt: TenantPaymentAttemptDto): string {
  return attempt.safeReason?.trim() || 'Die Zahlung konnte nicht durchgeführt werden.';
}

export function mapInvoiceStatusFilter(
  filter: 'all' | 'PAID' | 'OPEN' | 'OVERDUE' | 'VOID' | 'DRAFT',
): string | undefined {
  if (filter === 'all') return undefined;
  return filter;
}

export const tenantInvoiceStatusLabels = INVOICE_STATUS_FALLBACK;
