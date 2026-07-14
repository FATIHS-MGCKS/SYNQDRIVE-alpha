import {
  BookingPaymentRequest,
  BookingPaymentRequestStatus,
} from '@prisma/client';
import {
  PaymentReconciliationAmountMismatchError,
  PaymentReconciliationCurrencyMismatchError,
  PaymentReconciliationDomainError,
  PaymentReconciliationOrgMismatchError,
} from './payment-reconciliation.errors';

export interface ConnectWebhookSafeEventData {
  id?: string;
  type?: string;
  livemode?: boolean;
  account?: string | null;
  objectId?: string | null;
  objectType?: string | null;
  status?: string | null;
  amount?: number | null;
  amount_total?: number | null;
  amount_refunded?: number | null;
  currency?: string | null;
  payment_intent?: string | null;
  latest_charge?: string | null;
  charge?: string | null;
  metadata?: Record<string, string> | null;
  last_payment_error?: { code?: string; message?: string } | null;
}

export interface PaymentRequestMetadata {
  organizationId: string;
  bookingId: string;
  invoiceId: string;
  paymentRequestId: string;
}

const PAID_STATUSES: BookingPaymentRequestStatus[] = [
  BookingPaymentRequestStatus.PAID,
  BookingPaymentRequestStatus.PARTIALLY_REFUNDED,
  BookingPaymentRequestStatus.REFUNDED,
  BookingPaymentRequestStatus.DISPUTED,
];

export function parseConnectWebhookSafeEventData(
  value: unknown,
): ConnectWebhookSafeEventData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as ConnectWebhookSafeEventData;
}

export function extractPaymentRequestMetadata(
  safe: ConnectWebhookSafeEventData,
): PaymentRequestMetadata | null {
  const metadata = safe.metadata;
  if (!metadata?.paymentRequestId || !metadata.organizationId) {
    return null;
  }
  return {
    organizationId: metadata.organizationId,
    bookingId: metadata.bookingId ?? '',
    invoiceId: metadata.invoiceId ?? '',
    paymentRequestId: metadata.paymentRequestId,
  };
}

export function resolvePaymentAmountCents(safe: ConnectWebhookSafeEventData): number | null {
  if (typeof safe.amount === 'number') return safe.amount;
  if (typeof safe.amount_total === 'number') return safe.amount_total;
  return null;
}

export function normalizeCurrency(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return value.trim().toUpperCase();
}

export function isPaidPaymentRequestStatus(status: BookingPaymentRequestStatus): boolean {
  return PAID_STATUSES.includes(status);
}

export function shouldSkipDowngradeFromPaid(status: BookingPaymentRequestStatus): boolean {
  return isPaidPaymentRequestStatus(status);
}

export function assertPaymentRequestAlignment(params: {
  eventOrganizationId: string;
  metadata: PaymentRequestMetadata;
  request: BookingPaymentRequest;
  amountCents: number;
  currency: string;
  connectedAccountId: string | null;
}): void {
  if (params.metadata.organizationId !== params.eventOrganizationId) {
    throw new PaymentReconciliationOrgMismatchError();
  }
  if (params.request.organizationId !== params.eventOrganizationId) {
    throw new PaymentReconciliationOrgMismatchError();
  }
  if (params.metadata.paymentRequestId !== params.request.id) {
    throw new PaymentReconciliationDomainError(
      'Payment request metadata id does not match loaded request',
      'RECONCILIATION_PAYMENT_REQUEST_NOT_FOUND',
    );
  }
  if (
    params.request.stripeConnectedAccountId
    && params.connectedAccountId
    && params.request.stripeConnectedAccountId !== params.connectedAccountId
  ) {
    throw new PaymentReconciliationDomainError(
      'Connected account does not match payment request',
      'RECONCILIATION_ACCOUNT_MISMATCH',
    );
  }
  if (params.request.amountCents !== params.amountCents) {
    throw new PaymentReconciliationAmountMismatchError(
      params.request.amountCents,
      params.amountCents,
    );
  }
  const expectedCurrency = normalizeCurrency(params.request.currency);
  const actualCurrency = normalizeCurrency(params.currency);
  if (!expectedCurrency || !actualCurrency || expectedCurrency !== actualCurrency) {
    throw new PaymentReconciliationCurrencyMismatchError(
      expectedCurrency ?? params.request.currency,
      actualCurrency ?? params.currency,
    );
  }
}
