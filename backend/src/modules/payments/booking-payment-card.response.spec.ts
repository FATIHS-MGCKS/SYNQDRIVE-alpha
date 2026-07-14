import { BookingPaymentRequestStatus } from '@prisma/client';
import { mapPaymentRequestToCardDto } from './dto/booking-payment-card.response';
import { truncateStripeRef } from './utils/stripe-ref.util';

describe('booking payment card mapping', () => {
  it('truncates stripe references safely', () => {
    expect(truncateStripeRef('cs_test_abcdefghijklmnop')).toBe('cs_test_…mnop');
    expect(truncateStripeRef(null)).toBeNull();
  });

  it('maps OPEN request with open amount', () => {
    const dto = mapPaymentRequestToCardDto(
      {
        id: 'pr-1',
        status: BookingPaymentRequestStatus.OPEN,
        purpose: 'RENTAL_PAYMENT',
        amountCents: 10_000,
        paidAmountCents: 0,
        refundedAmountCents: 0,
        currency: 'EUR',
        recipientEmail: 'a@b.de',
        checkoutUrl: 'https://checkout.stripe.test',
        checkoutExpiresAt: new Date('2026-07-21T12:00:00Z'),
        lastSentAt: null,
        paidAt: null,
        failedAt: null,
        cancelledAt: null,
        sendAttemptCount: 0,
        lastEmailErrorMessage: null,
        stripeCheckoutSessionId: 'cs_test_1234567890',
        stripePaymentIntentId: null,
        stripeChargeId: null,
      } as never,
      5_000,
      [],
    );

    expect(dto.openAmountCents).toBe(10_000);
    expect(dto.depositAmountCents).toBe(5_000);
    expect(dto.refundStatus).toBe('NONE');
    expect(dto.stripeCheckoutSessionId).toBe('cs_test_…7890');
  });

  it('maps PAID and PARTIALLY_REFUNDED statuses', () => {
    const paid = mapPaymentRequestToCardDto(
      {
        id: 'pr-2',
        status: BookingPaymentRequestStatus.PAID,
        purpose: 'RENTAL_PAYMENT',
        amountCents: 10_000,
        paidAmountCents: 10_000,
        refundedAmountCents: 0,
        currency: 'EUR',
        paidAt: new Date(),
      } as never,
      0,
      [{ type: 'CHARGE', status: 'SUCCEEDED', amountCents: 10_000 } as never],
    );
    expect(paid.openAmountCents).toBe(0);
    expect(paid.paymentMethodLabel).toBe('Karte (Stripe)');

    const partial = mapPaymentRequestToCardDto(
      {
        id: 'pr-3',
        status: BookingPaymentRequestStatus.PARTIALLY_REFUNDED,
        purpose: 'RENTAL_PAYMENT',
        amountCents: 10_000,
        paidAmountCents: 10_000,
        refundedAmountCents: 2_000,
        currency: 'EUR',
      } as never,
      0,
      [],
    );
    expect(partial.refundStatus).toBe('PARTIAL');
  });

  it('maps DISPUTED status', () => {
    const dto = mapPaymentRequestToCardDto(
      {
        id: 'pr-4',
        status: BookingPaymentRequestStatus.DISPUTED,
        purpose: 'RENTAL_PAYMENT',
        amountCents: 10_000,
        paidAmountCents: 10_000,
        refundedAmountCents: 0,
        currency: 'EUR',
      } as never,
      0,
      [],
    );
    expect(dto.disputeStatus).toBe('OPEN');
  });
});
