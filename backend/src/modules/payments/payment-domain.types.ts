import {
  BookingPaymentRequestStatus,
  BookingPaymentStatus,
  PaymentTransactionStatus,
  PaymentTransactionType,
} from '@prisma/client';

/** Minimal payment-request snapshot for pure domain functions (no Stripe types). */
export interface PaymentRequestSnapshot {
  status: BookingPaymentRequestStatus;
  amountCents: number;
  paidAmountCents: number;
  refundedAmountCents: number;
}

/** Minimal ledger row for transition guards (append-only truth). */
export interface PaymentTransactionSnapshot {
  type: PaymentTransactionType;
  status: PaymentTransactionStatus;
  amountCents: number;
}

/** Context evaluated when validating/applying a status transition. */
export interface PaymentTransitionContext {
  request: PaymentRequestSnapshot;
  transactions: readonly PaymentTransactionSnapshot[];
  /** Required when transitioning to PARTIALLY_REFUNDED or REFUNDED. */
  refundAmountCents?: number;
}

/** Patch produced by applyTransition — consumed by PaymentStatusService for persistence. */
export interface PaymentRequestTransitionPatch {
  status: BookingPaymentRequestStatus;
  paidAmountCents?: number;
  refundedAmountCents?: number;
  paidAt?: Date | null;
  failedAt?: Date | null;
  cancelledAt?: Date | null;
  version?: number;
}

export interface PaymentRequestSummary extends PaymentRequestSnapshot {
  id?: string;
}

export { BookingPaymentRequestStatus, BookingPaymentStatus, PaymentTransactionStatus, PaymentTransactionType };
