import type {
  TenantInvoiceListItemDto,
  TenantInvoicePaymentHistoryDto,
  TenantPaymentAttemptDto,
} from '../../types/billing.types';

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

export function summarizeFailedAttemptReason(
  attempt: TenantPaymentAttemptDto,
): string | null {
  return attempt.safeReason?.trim() || null;
}

export function mapInvoiceStatusFilter(
  filter: 'all' | 'PAID' | 'OPEN' | 'OVERDUE' | 'VOID' | 'DRAFT',
): string | undefined {
  if (filter === 'all') return undefined;
  return filter;
}
