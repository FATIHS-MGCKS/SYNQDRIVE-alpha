/**
 * Structured payment logging — no PII, secrets, or full Stripe IDs.
 */

export interface PaymentLogContext {
  organizationId?: string;
  bookingId?: string;
  paymentRequestId?: string;
  stripeEventId?: string;
  connectedAccountId?: string;
  outcome?: string;
  eventType?: string;
}

export function truncateConnectedAccountId(
  accountId: string | null | undefined,
): string | undefined {
  if (!accountId?.trim()) return undefined;
  const id = accountId.trim();
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export function formatPaymentLogPayload(
  event: string,
  context: PaymentLogContext,
  detail?: Record<string, string | number | boolean | null | undefined>,
): Record<string, unknown> {
  return {
    event,
    organizationId: context.organizationId ?? null,
    bookingId: context.bookingId ?? null,
    paymentRequestId: context.paymentRequestId ?? null,
    stripeEventId: context.stripeEventId ?? null,
    connectedAccountId: truncateConnectedAccountId(context.connectedAccountId),
    outcome: context.outcome ?? null,
    eventType: context.eventType ?? null,
    ...detail,
  };
}
