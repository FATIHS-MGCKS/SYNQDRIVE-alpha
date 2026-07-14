import {
  BookingPaymentRequestStatus,
  BookingPaymentStatus,
  PaymentTransactionStatus,
  PaymentTransactionType,
} from '@prisma/client';
import {
  CancelAfterFullPaymentError,
  MissingRefundAmountError,
  PaidWithoutConfirmedChargeError,
  PaymentStatusTransitionError,
  RefundExceedsRefundableError,
  RefundWithoutPriorPaymentError,
  ResetPaidStatusError,
} from './payment-domain.errors';
import {
  PaymentRequestSummary,
  PaymentRequestTransitionPatch,
  PaymentTransitionContext,
} from './payment-domain.types';

const PRE_PAYMENT_STATUSES: readonly BookingPaymentRequestStatus[] = [
  BookingPaymentRequestStatus.DRAFT,
  BookingPaymentRequestStatus.OPEN,
  BookingPaymentRequestStatus.LINK_PENDING,
  BookingPaymentRequestStatus.CHECKOUT_READY,
  BookingPaymentRequestStatus.LINK_SENT,
];

const IN_FLIGHT_STATUSES: readonly BookingPaymentRequestStatus[] = [
  BookingPaymentRequestStatus.OPEN,
  BookingPaymentRequestStatus.LINK_PENDING,
  BookingPaymentRequestStatus.CHECKOUT_READY,
  BookingPaymentRequestStatus.LINK_SENT,
  BookingPaymentRequestStatus.PROCESSING,
];

const PAID_FAMILY: readonly BookingPaymentRequestStatus[] = [
  BookingPaymentRequestStatus.PAID,
  BookingPaymentRequestStatus.PARTIALLY_REFUNDED,
  BookingPaymentRequestStatus.REFUNDED,
  BookingPaymentRequestStatus.DISPUTED,
];

const TERMINAL_STATUSES: readonly BookingPaymentRequestStatus[] = [
  BookingPaymentRequestStatus.FAILED,
  BookingPaymentRequestStatus.CANCELLED,
  BookingPaymentRequestStatus.EXPIRED,
  BookingPaymentRequestStatus.REFUNDED,
];

/** Structural transitions before financial guards. */
const BASE_TRANSITIONS: Readonly<
  Record<BookingPaymentRequestStatus, readonly BookingPaymentRequestStatus[]>
> = {
  [BookingPaymentRequestStatus.DRAFT]: [BookingPaymentRequestStatus.OPEN],
  [BookingPaymentRequestStatus.OPEN]: [
    BookingPaymentRequestStatus.LINK_PENDING,
    BookingPaymentRequestStatus.CANCELLED,
  ],
  [BookingPaymentRequestStatus.LINK_PENDING]: [
    BookingPaymentRequestStatus.CHECKOUT_READY,
    BookingPaymentRequestStatus.OPEN,
  ],
  [BookingPaymentRequestStatus.CHECKOUT_READY]: [
    BookingPaymentRequestStatus.LINK_PENDING,
    BookingPaymentRequestStatus.LINK_SENT,
    BookingPaymentRequestStatus.PROCESSING,
    BookingPaymentRequestStatus.CANCELLED,
    BookingPaymentRequestStatus.EXPIRED,
  ],
  [BookingPaymentRequestStatus.LINK_SENT]: [
    BookingPaymentRequestStatus.PROCESSING,
    BookingPaymentRequestStatus.CANCELLED,
    BookingPaymentRequestStatus.EXPIRED,
  ],
  [BookingPaymentRequestStatus.PROCESSING]: [
    BookingPaymentRequestStatus.PAID,
    BookingPaymentRequestStatus.FAILED,
  ],
  [BookingPaymentRequestStatus.PAID]: [
    BookingPaymentRequestStatus.PARTIALLY_REFUNDED,
    BookingPaymentRequestStatus.REFUNDED,
    BookingPaymentRequestStatus.DISPUTED,
  ],
  [BookingPaymentRequestStatus.PARTIALLY_REFUNDED]: [BookingPaymentRequestStatus.REFUNDED],
  [BookingPaymentRequestStatus.REFUNDED]: [],
  [BookingPaymentRequestStatus.FAILED]: [],
  [BookingPaymentRequestStatus.CANCELLED]: [],
  [BookingPaymentRequestStatus.EXPIRED]: [],
  [BookingPaymentRequestStatus.DISPUTED]: [],
};

export function allowedPaymentRequestStatusTargets(
  from: BookingPaymentRequestStatus,
): BookingPaymentRequestStatus[] {
  return [...(BASE_TRANSITIONS[from] ?? [])];
}

export function hasConfirmedCharge(transactions: readonly { type: PaymentTransactionType; status: PaymentTransactionStatus }[]): boolean {
  return transactions.some(
    (tx) =>
      tx.type === PaymentTransactionType.CHARGE && tx.status === PaymentTransactionStatus.SUCCEEDED,
  );
}

export function confirmedChargeAmountCents(
  transactions: readonly { type: PaymentTransactionType; status: PaymentTransactionStatus; amountCents: number }[],
): number {
  return transactions
    .filter(
      (tx) =>
        tx.type === PaymentTransactionType.CHARGE && tx.status === PaymentTransactionStatus.SUCCEEDED,
    )
    .reduce((sum, tx) => sum + tx.amountCents, 0);
}

export function calculateOutstandingAmount(request: {
  amountCents: number;
  paidAmountCents: number;
  refundedAmountCents: number;
}): number {
  return Math.max(0, request.amountCents - request.paidAmountCents + request.refundedAmountCents);
}

export function calculateRefundableAmount(request: {
  paidAmountCents: number;
  refundedAmountCents: number;
}): number {
  return Math.max(0, request.paidAmountCents - request.refundedAmountCents);
}

function assertNotResettingPaidStatus(
  from: BookingPaymentRequestStatus,
  to: BookingPaymentRequestStatus,
): void {
  if (PAID_FAMILY.includes(from) && PRE_PAYMENT_STATUSES.includes(to)) {
    throw new ResetPaidStatusError(from, to);
  }
  if (from === BookingPaymentRequestStatus.PAID && to === BookingPaymentRequestStatus.PROCESSING) {
    throw new ResetPaidStatusError(from, to);
  }
  if (from === BookingPaymentRequestStatus.PAID && to === BookingPaymentRequestStatus.OPEN) {
    throw new ResetPaidStatusError(from, to);
  }
}

function assertCancelAllowed(request: { amountCents: number; paidAmountCents: number }): void {
  if (request.paidAmountCents >= request.amountCents && request.amountCents > 0) {
    throw new CancelAfterFullPaymentError();
  }
}

function assertPaidAllowed(
  request: { amountCents: number },
  transactions: PaymentTransitionContext['transactions'],
): void {
  if (!hasConfirmedCharge(transactions)) {
    throw new PaidWithoutConfirmedChargeError();
  }
  const charged = confirmedChargeAmountCents(transactions);
  if (charged < request.amountCents) {
    throw new PaidWithoutConfirmedChargeError();
  }
}

function assertRefundAllowed(
  request: { paidAmountCents: number; refundedAmountCents: number },
  transactions: PaymentTransitionContext['transactions'],
  refundAmountCents: number | undefined,
  to: BookingPaymentRequestStatus,
): number {
  if (!hasConfirmedCharge(transactions) || request.paidAmountCents <= 0) {
    throw new RefundWithoutPriorPaymentError();
  }
  if (refundAmountCents == null || refundAmountCents <= 0) {
    throw new MissingRefundAmountError();
  }
  const refundable = calculateRefundableAmount(request);
  if (refundAmountCents > refundable) {
    throw new RefundExceedsRefundableError(refundAmountCents, refundable);
  }
  if (to === BookingPaymentRequestStatus.REFUNDED && refundAmountCents !== refundable) {
    throw new RefundExceedsRefundableError(refundAmountCents, refundable);
  }
  return refundAmountCents;
}

export function canTransition(
  from: BookingPaymentRequestStatus,
  to: BookingPaymentRequestStatus,
  context: PaymentTransitionContext,
): boolean {
  try {
    assertTransition(from, to, context);
    return true;
  } catch {
    return false;
  }
}

export function assertTransition(
  from: BookingPaymentRequestStatus,
  to: BookingPaymentRequestStatus,
  context: PaymentTransitionContext,
): void {
  if (from === to) {
    return;
  }

  assertNotResettingPaidStatus(from, to);

  if (!allowedPaymentRequestStatusTargets(from).includes(to)) {
    throw new PaymentStatusTransitionError(from, to);
  }

  if (to === BookingPaymentRequestStatus.CANCELLED) {
    assertCancelAllowed(context.request);
  }

  if (to === BookingPaymentRequestStatus.PAID) {
    assertPaidAllowed(context.request, context.transactions);
  }

  if (
    to === BookingPaymentRequestStatus.PARTIALLY_REFUNDED
    || to === BookingPaymentRequestStatus.REFUNDED
  ) {
    assertRefundAllowed(
      context.request,
      context.transactions,
      context.refundAmountCents,
      to,
    );
  }
}

export function applyTransition(
  from: BookingPaymentRequestStatus,
  to: BookingPaymentRequestStatus,
  context: PaymentTransitionContext,
  now: Date = new Date(),
): PaymentRequestTransitionPatch {
  assertTransition(from, to, context);

  if (from === to) {
    return { status: from };
  }

  const patch: PaymentRequestTransitionPatch = { status: to };

  if (to === BookingPaymentRequestStatus.PAID) {
    const charged = confirmedChargeAmountCents(context.transactions);
    patch.paidAmountCents = charged;
    patch.paidAt = now;
  }

  if (to === BookingPaymentRequestStatus.FAILED) {
    patch.failedAt = now;
  }

  if (to === BookingPaymentRequestStatus.CANCELLED) {
    patch.cancelledAt = now;
  }

  if (
    to === BookingPaymentRequestStatus.PARTIALLY_REFUNDED
    || to === BookingPaymentRequestStatus.REFUNDED
  ) {
    const refundAmount = context.refundAmountCents!;
    patch.refundedAmountCents = context.request.refundedAmountCents + refundAmount;
    if (to === BookingPaymentRequestStatus.REFUNDED) {
      patch.refundedAmountCents = context.request.paidAmountCents;
    }
  }

  return patch;
}

export function deriveBookingPaymentStatus(
  requests: readonly PaymentRequestSummary[],
): BookingPaymentStatus {
  if (requests.length === 0) {
    return BookingPaymentStatus.UNPAID;
  }

  const active = requests.filter((r) => !TERMINAL_STATUSES.includes(r.status) || r.status === BookingPaymentRequestStatus.REFUNDED);
  const relevant = active.length > 0 ? active : requests;

  const totalDue = relevant.reduce((sum, r) => sum + r.amountCents, 0);
  const totalPaid = relevant.reduce((sum, r) => sum + r.paidAmountCents, 0);
  const totalRefunded = relevant.reduce((sum, r) => sum + r.refundedAmountCents, 0);
  const netPaid = totalPaid - totalRefunded;

  const allFullyRefunded =
    relevant.length > 0
    && relevant.every(
      (r) =>
        r.status === BookingPaymentRequestStatus.REFUNDED
        || (r.paidAmountCents > 0 && r.refundedAmountCents >= r.paidAmountCents),
    );

  if (allFullyRefunded && totalPaid > 0) {
    return BookingPaymentStatus.REFUNDED;
  }

  const hasDisputed = relevant.some((r) => r.status === BookingPaymentRequestStatus.DISPUTED);
  const hasFailed = relevant.some((r) => r.status === BookingPaymentRequestStatus.FAILED);
  const hasInFlight = relevant.some((r) => IN_FLIGHT_STATUSES.includes(r.status));

  if (hasDisputed || hasInFlight) {
    return BookingPaymentStatus.PENDING;
  }

  if (totalDue > 0 && netPaid >= totalDue) {
    return BookingPaymentStatus.PAID;
  }

  if (netPaid > 0 && netPaid < totalDue) {
    return BookingPaymentStatus.PARTIALLY_PAID;
  }

  if (hasFailed && netPaid === 0) {
    return BookingPaymentStatus.FAILED;
  }

  return BookingPaymentStatus.UNPAID;
}

export function isTerminalPaymentRequestStatus(status: BookingPaymentRequestStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export { BASE_TRANSITIONS, IN_FLIGHT_STATUSES, PAID_FAMILY, PRE_PAYMENT_STATUSES, TERMINAL_STATUSES };
