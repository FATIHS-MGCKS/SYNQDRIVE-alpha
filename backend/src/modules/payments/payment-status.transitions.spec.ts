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
import { PaymentTransitionContext } from './payment-domain.types';
import {
  allowedPaymentRequestStatusTargets,
  applyTransition,
  BASE_TRANSITIONS,
  calculateOutstandingAmount,
  calculateRefundableAmount,
  canTransition,
  deriveBookingPaymentStatus,
  hasConfirmedCharge,
} from './payment-status.transitions';

const NOW = new Date('2026-07-14T12:00:00.000Z');

function ctx(
  overrides: Partial<PaymentTransitionContext['request']> = {},
  transactions: PaymentTransitionContext['transactions'] = [],
  refundAmountCents?: number,
): PaymentTransitionContext {
  return {
    request: {
      status: BookingPaymentRequestStatus.DRAFT,
      amountCents: 10_000,
      paidAmountCents: 0,
      refundedAmountCents: 0,
      ...overrides,
    },
    transactions,
    refundAmountCents,
  };
}

function succeededCharge(amountCents: number) {
  return {
    type: PaymentTransactionType.CHARGE,
    status: PaymentTransactionStatus.SUCCEEDED,
    amountCents,
  };
}

describe('payment-status.transitions', () => {
  describe('allowedPaymentRequestStatusTargets', () => {
    it('matches the documented lifecycle diagram', () => {
      expect(allowedPaymentRequestStatusTargets(BookingPaymentRequestStatus.DRAFT)).toEqual([
        BookingPaymentRequestStatus.OPEN,
      ]);
      expect(allowedPaymentRequestStatusTargets(BookingPaymentRequestStatus.OPEN)).toEqual([
        BookingPaymentRequestStatus.LINK_PENDING,
        BookingPaymentRequestStatus.CANCELLED,
      ]);
      expect(allowedPaymentRequestStatusTargets(BookingPaymentRequestStatus.LINK_PENDING)).toEqual([
        BookingPaymentRequestStatus.CHECKOUT_READY,
        BookingPaymentRequestStatus.OPEN,
      ]);
      expect(allowedPaymentRequestStatusTargets(BookingPaymentRequestStatus.CHECKOUT_READY)).toEqual(
        expect.arrayContaining([
          BookingPaymentRequestStatus.LINK_PENDING,
          BookingPaymentRequestStatus.LINK_SENT,
          BookingPaymentRequestStatus.PROCESSING,
        ]),
      );
      expect(allowedPaymentRequestStatusTargets(BookingPaymentRequestStatus.LINK_SENT)).toEqual([
        BookingPaymentRequestStatus.PROCESSING,
        BookingPaymentRequestStatus.CANCELLED,
        BookingPaymentRequestStatus.EXPIRED,
      ]);
      expect(allowedPaymentRequestStatusTargets(BookingPaymentRequestStatus.PROCESSING)).toEqual([
        BookingPaymentRequestStatus.PAID,
        BookingPaymentRequestStatus.FAILED,
      ]);
      expect(allowedPaymentRequestStatusTargets(BookingPaymentRequestStatus.PAID)).toEqual([
        BookingPaymentRequestStatus.PARTIALLY_REFUNDED,
        BookingPaymentRequestStatus.REFUNDED,
        BookingPaymentRequestStatus.DISPUTED,
      ]);
      expect(
        allowedPaymentRequestStatusTargets(BookingPaymentRequestStatus.PARTIALLY_REFUNDED),
      ).toEqual([BookingPaymentRequestStatus.REFUNDED]);
    });

    it('exposes every enum value in BASE_TRANSITIONS', () => {
      for (const status of Object.values(BookingPaymentRequestStatus)) {
        expect(BASE_TRANSITIONS).toHaveProperty(status);
      }
    });
  });

  describe('happy-path transitions', () => {
    const mainFlow: BookingPaymentRequestStatus[] = [
      BookingPaymentRequestStatus.DRAFT,
      BookingPaymentRequestStatus.OPEN,
      BookingPaymentRequestStatus.LINK_PENDING,
      BookingPaymentRequestStatus.CHECKOUT_READY,
      BookingPaymentRequestStatus.LINK_SENT,
      BookingPaymentRequestStatus.PROCESSING,
      BookingPaymentRequestStatus.PAID,
    ];

    it('allows the main lifecycle chain before PAID', () => {
      for (let i = 0; i < mainFlow.length - 1; i++) {
        const from = mainFlow[i];
        const to = mainFlow[i + 1];
        const context =
          to === BookingPaymentRequestStatus.PAID
            ? ctx(
                {
                  status: from,
                  paidAmountCents: 0,
                },
                [succeededCharge(10_000)],
              )
            : ctx({ status: from });
        expect(canTransition(from, to, context)).toBe(true);
      }
    });

    it('applies timestamps and paid amounts on terminal transitions', () => {
      const paidPatch = applyTransition(
        BookingPaymentRequestStatus.PROCESSING,
        BookingPaymentRequestStatus.PAID,
        ctx({ status: BookingPaymentRequestStatus.PROCESSING }, [succeededCharge(10_000)]),
        NOW,
      );
      expect(paidPatch).toMatchObject({
        status: BookingPaymentRequestStatus.PAID,
        paidAmountCents: 10_000,
        paidAt: NOW,
      });

      const failedPatch = applyTransition(
        BookingPaymentRequestStatus.PROCESSING,
        BookingPaymentRequestStatus.FAILED,
        ctx({ status: BookingPaymentRequestStatus.PROCESSING }),
        NOW,
      );
      expect(failedPatch).toMatchObject({
        status: BookingPaymentRequestStatus.FAILED,
        failedAt: NOW,
      });

      const cancelledPatch = applyTransition(
        BookingPaymentRequestStatus.OPEN,
        BookingPaymentRequestStatus.CANCELLED,
        ctx({ status: BookingPaymentRequestStatus.OPEN }),
        NOW,
      );
      expect(cancelledPatch).toMatchObject({
        status: BookingPaymentRequestStatus.CANCELLED,
        cancelledAt: NOW,
      });
    });
  });

  describe('forbidden transitions', () => {
    it('rejects PAID without confirmed CHARGE transaction', () => {
      const context = ctx({ status: BookingPaymentRequestStatus.PROCESSING });
      expect(() =>
        applyTransition(
          BookingPaymentRequestStatus.PROCESSING,
          BookingPaymentRequestStatus.PAID,
          context,
        ),
      ).toThrow(PaidWithoutConfirmedChargeError);
    });

    it('rejects PAID when charge amount is below request amount', () => {
      const context = ctx(
        { status: BookingPaymentRequestStatus.PROCESSING },
        [succeededCharge(5_000)],
      );
      expect(() =>
        applyTransition(
          BookingPaymentRequestStatus.PROCESSING,
          BookingPaymentRequestStatus.PAID,
          context,
        ),
      ).toThrow(PaidWithoutConfirmedChargeError);
    });

    it('rejects REFUNDED without prior successful payment', () => {
      const context = ctx(
        { status: BookingPaymentRequestStatus.PAID, paidAmountCents: 10_000 },
        [],
        10_000,
      );
      expect(() =>
        applyTransition(
          BookingPaymentRequestStatus.PAID,
          BookingPaymentRequestStatus.REFUNDED,
          context,
        ),
      ).toThrow(RefundWithoutPriorPaymentError);
    });

    it('rejects refund greater than refundable amount', () => {
      const context = ctx(
        {
          status: BookingPaymentRequestStatus.PAID,
          paidAmountCents: 10_000,
          refundedAmountCents: 2_000,
        },
        [succeededCharge(10_000)],
        9_000,
      );
      expect(() =>
        applyTransition(
          BookingPaymentRequestStatus.PAID,
          BookingPaymentRequestStatus.PARTIALLY_REFUNDED,
          context,
        ),
      ).toThrow(RefundExceedsRefundableError);
    });

    it('rejects CANCELLED after full payment', () => {
      const context = ctx({
        status: BookingPaymentRequestStatus.LINK_SENT,
        paidAmountCents: 10_000,
        amountCents: 10_000,
      });
      expect(() =>
        applyTransition(
          BookingPaymentRequestStatus.LINK_SENT,
          BookingPaymentRequestStatus.CANCELLED,
          context,
        ),
      ).toThrow(CancelAfterFullPaymentError);
    });

    it('rejects resetting PAID to OPEN', () => {
      const context = ctx({ status: BookingPaymentRequestStatus.PAID, paidAmountCents: 10_000 });
      expect(() =>
        applyTransition(BookingPaymentRequestStatus.PAID, BookingPaymentRequestStatus.OPEN, context),
      ).toThrow(ResetPaidStatusError);
    });

    it('rejects arbitrary jumps (DRAFT → PAID)', () => {
      const context = ctx(
        { status: BookingPaymentRequestStatus.DRAFT },
        [succeededCharge(10_000)],
      );
      expect(() =>
        applyTransition(BookingPaymentRequestStatus.DRAFT, BookingPaymentRequestStatus.PAID, context),
      ).toThrow(PaymentStatusTransitionError);
    });

    it('rejects LINK_PENDING → CANCELLED (not in allowed targets)', () => {
      const context = ctx({ status: BookingPaymentRequestStatus.LINK_PENDING });
      expect(canTransition(
        BookingPaymentRequestStatus.LINK_PENDING,
        BookingPaymentRequestStatus.CANCELLED,
        context,
      )).toBe(false);
    });

    it('requires refundAmountCents for refund transitions', () => {
      const context = ctx(
        { status: BookingPaymentRequestStatus.PAID, paidAmountCents: 10_000 },
        [succeededCharge(10_000)],
      );
      expect(() =>
        applyTransition(
          BookingPaymentRequestStatus.PAID,
          BookingPaymentRequestStatus.PARTIALLY_REFUNDED,
          context,
        ),
      ).toThrow(MissingRefundAmountError);
    });
  });

  describe('refund transitions', () => {
    it('allows partial then full refund', () => {
      const partialContext = ctx(
        { status: BookingPaymentRequestStatus.PAID, paidAmountCents: 10_000 },
        [succeededCharge(10_000)],
        3_000,
      );
      const partialPatch = applyTransition(
        BookingPaymentRequestStatus.PAID,
        BookingPaymentRequestStatus.PARTIALLY_REFUNDED,
        partialContext,
        NOW,
      );
      expect(partialPatch.refundedAmountCents).toBe(3_000);

      const fullContext = ctx(
        {
          status: BookingPaymentRequestStatus.PARTIALLY_REFUNDED,
          paidAmountCents: 10_000,
          refundedAmountCents: 3_000,
        },
        [succeededCharge(10_000)],
        7_000,
      );
      const fullPatch = applyTransition(
        BookingPaymentRequestStatus.PARTIALLY_REFUNDED,
        BookingPaymentRequestStatus.REFUNDED,
        fullContext,
        NOW,
      );
      expect(fullPatch.refundedAmountCents).toBe(10_000);
    });

    it('allows PAID → DISPUTED when charge exists', () => {
      const context = ctx(
        { status: BookingPaymentRequestStatus.PAID, paidAmountCents: 10_000 },
        [succeededCharge(10_000)],
      );
      expect(
        canTransition(BookingPaymentRequestStatus.PAID, BookingPaymentRequestStatus.DISPUTED, context),
      ).toBe(true);
    });
  });

  describe('amount helpers', () => {
    it('calculateOutstandingAmount subtracts paid and adds refunds', () => {
      expect(
        calculateOutstandingAmount({
          amountCents: 10_000,
          paidAmountCents: 4_000,
          refundedAmountCents: 1_000,
        }),
      ).toBe(7_000);
    });

    it('calculateRefundableAmount uses paid minus refunded', () => {
      expect(
        calculateRefundableAmount({ paidAmountCents: 10_000, refundedAmountCents: 2_500 }),
      ).toBe(7_500);
    });

    it('hasConfirmedCharge ignores non-succeeded charges', () => {
      expect(
        hasConfirmedCharge([
          {
            type: PaymentTransactionType.CHARGE,
            status: PaymentTransactionStatus.PENDING,
          },
        ]),
      ).toBe(false);
    });
  });

  describe('deriveBookingPaymentStatus', () => {
    it('returns UNPAID for empty request list', () => {
      expect(deriveBookingPaymentStatus([])).toBe(BookingPaymentStatus.UNPAID);
    });

    it('returns PENDING when a request is in-flight', () => {
      expect(
        deriveBookingPaymentStatus([
          {
            status: BookingPaymentRequestStatus.LINK_SENT,
            amountCents: 10_000,
            paidAmountCents: 0,
            refundedAmountCents: 0,
          },
        ]),
      ).toBe(BookingPaymentStatus.PENDING);
    });

    it('returns PAID when net paid covers total due', () => {
      expect(
        deriveBookingPaymentStatus([
          {
            status: BookingPaymentRequestStatus.PAID,
            amountCents: 10_000,
            paidAmountCents: 10_000,
            refundedAmountCents: 0,
          },
        ]),
      ).toBe(BookingPaymentStatus.PAID);
    });

    it('returns PARTIALLY_PAID when some amount is paid', () => {
      expect(
        deriveBookingPaymentStatus([
          {
            status: BookingPaymentRequestStatus.PAID,
            amountCents: 10_000,
            paidAmountCents: 4_000,
            refundedAmountCents: 0,
          },
        ]),
      ).toBe(BookingPaymentStatus.PARTIALLY_PAID);
    });

    it('returns REFUNDED when all paid amounts are refunded', () => {
      expect(
        deriveBookingPaymentStatus([
          {
            status: BookingPaymentRequestStatus.REFUNDED,
            amountCents: 10_000,
            paidAmountCents: 10_000,
            refundedAmountCents: 10_000,
          },
        ]),
      ).toBe(BookingPaymentStatus.REFUNDED);
    });

    it('returns PENDING for DISPUTED requests', () => {
      expect(
        deriveBookingPaymentStatus([
          {
            status: BookingPaymentRequestStatus.DISPUTED,
            amountCents: 10_000,
            paidAmountCents: 10_000,
            refundedAmountCents: 0,
          },
        ]),
      ).toBe(BookingPaymentStatus.PENDING);
    });

    it('returns FAILED when failed with no payment', () => {
      expect(
        deriveBookingPaymentStatus([
          {
            status: BookingPaymentRequestStatus.FAILED,
            amountCents: 10_000,
            paidAmountCents: 0,
            refundedAmountCents: 0,
          },
        ]),
      ).toBe(BookingPaymentStatus.FAILED);
    });
  });
});
