import { BillingPaymentStatus, BillingRefundStatus } from '@prisma/client';

export const BillingPaymentLedgerErrorCode = {
  INVOICE_NOT_FOUND: 'BILLING_PAYMENT_LEDGER_INVOICE_NOT_FOUND',
  PAYMENT_NOT_FOUND: 'BILLING_PAYMENT_LEDGER_PAYMENT_NOT_FOUND',
  DUPLICATE_EVENT: 'BILLING_PAYMENT_LEDGER_DUPLICATE_EVENT',
  INVALID_AMOUNT: 'BILLING_PAYMENT_LEDGER_INVALID_AMOUNT',
  MANUAL_PAYMENT_NOT_ALLOWED: 'BILLING_PAYMENT_LEDGER_MANUAL_PAYMENT_NOT_ALLOWED',
} as const;

export type BillingPaymentLedgerErrorCode =
  (typeof BillingPaymentLedgerErrorCode)[keyof typeof BillingPaymentLedgerErrorCode];

const CARD_NUMBER_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;
const SECRET_PATTERN = /(sk|rk|pk)_(live|test)_[A-Za-z0-9]+/g;

export function sanitizeProviderErrorMessage(
  message: string | null | undefined,
): string | null {
  if (!message) {
    return null;
  }

  let safe = message
    .replace(CARD_NUMBER_PATTERN, '[redacted]')
    .replace(SECRET_PATTERN, '[redacted]')
    .trim();

  if (safe.length > 240) {
    safe = `${safe.slice(0, 237)}...`;
  }

  return safe || null;
}

export function computeRefundedTotal(
  refunds: Array<{ amountCents: number; status: BillingRefundStatus }>,
): number {
  return refunds
    .filter((refund) => refund.status === BillingRefundStatus.SUCCEEDED)
    .reduce((sum, refund) => sum + refund.amountCents, 0);
}

export function resolveRefundPartialFlag(input: {
  refundAmountCents: number;
  paymentAmountCents: number;
  refundedBeforeCents: number;
}): boolean {
  return input.refundedBeforeCents + input.refundAmountCents < input.paymentAmountCents;
}

export function reconcilePaymentRefundState(input: {
  paymentAmountCents: number;
  refundedAmountCents: number;
  currentStatus: BillingPaymentStatus;
}): {
  status: BillingPaymentStatus;
  refundedAmountCents: number;
  remainingAmountCents: number;
} {
  const refundedAmountCents = Math.min(input.refundedAmountCents, input.paymentAmountCents);
  const remainingAmountCents = Math.max(input.paymentAmountCents - refundedAmountCents, 0);

  if (refundedAmountCents <= 0) {
    return {
      status: input.currentStatus === BillingPaymentStatus.REFUNDED ||
        input.currentStatus === BillingPaymentStatus.PARTIALLY_REFUNDED
        ? BillingPaymentStatus.SUCCEEDED
        : input.currentStatus,
      refundedAmountCents: 0,
      remainingAmountCents: input.paymentAmountCents,
    };
  }

  if (remainingAmountCents === 0) {
    return {
      status: BillingPaymentStatus.REFUNDED,
      refundedAmountCents,
      remainingAmountCents: 0,
    };
  }

  return {
    status: BillingPaymentStatus.PARTIALLY_REFUNDED,
    refundedAmountCents,
    remainingAmountCents,
  };
}

export interface SafePaymentLedgerView {
  paymentId: string;
  invoiceId: string;
  amountCents: number;
  currency: string;
  status: BillingPaymentStatus;
  provider: string;
  refundedAmountCents: number;
  remainingAmountCents: number | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  stripePaymentMethodId: string | null;
  succeededAt: string | null;
  failedAt: string | null;
  attempts: Array<{
    id: string;
    attemptNumber: number;
    status: string;
    errorCode: string | null;
    declineCode: string | null;
    safeErrorMessage: string | null;
    nextRetryAt: string | null;
    attemptedAt: string;
  }>;
  refunds: Array<{
    id: string;
    amountCents: number;
    status: string;
    isPartial: boolean;
    reason: string | null;
    refundedAt: string | null;
  }>;
  creditNotes: Array<{
    id: string;
    amountCents: number;
    status: string;
    reason: string | null;
    hostedUrl: string | null;
    pdfUrl: string | null;
    issuedAt: string | null;
  }>;
}
