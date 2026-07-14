import { BookingPriceLineItemType } from '@prisma/client';
import { PaymentFeeBasis } from '../payment-fee.types';
import {
  buildCheckoutLineItemsFromSnapshot,
  isCheckoutSessionStillActive,
  resolveStripeCheckoutExpiresAt,
} from './checkout-line-items.util';

describe('checkout-line-items.util', () => {
  it('excludes deposit from checkout line items', () => {
    const items = buildCheckoutLineItemsFromSnapshot(
      [
        {
          type: BookingPriceLineItemType.BASE_RENTAL,
          totalNetCents: 50_000,
          totalGrossCents: 59_500,
        },
        {
          type: BookingPriceLineItemType.DEPOSIT,
          totalNetCents: 10_000,
          totalGrossCents: 10_000,
        },
      ],
      PaymentFeeBasis.GROSS_RENTAL_EXCL_DEPOSIT,
      59_500,
    );
    expect(items).toHaveLength(1);
    expect(items[0].amountCents).toBe(59_500);
  });

  it('rejects when line item total mismatches frozen payment amount', () => {
    expect(() =>
      buildCheckoutLineItemsFromSnapshot(
        [
          {
            type: BookingPriceLineItemType.BASE_RENTAL,
            totalNetCents: 50_000,
            totalGrossCents: 59_500,
          },
        ],
        PaymentFeeBasis.GROSS_RENTAL_EXCL_DEPOSIT,
        40_000,
      ),
    ).toThrow(/does not match frozen payment amount/);
  });

  it('clamps stripe checkout expiry between 30 minutes and 24 hours', () => {
    const now = new Date('2026-07-14T12:00:00.000Z');
    const farFuture = new Date('2026-07-20T12:00:00.000Z');
    const resolved = resolveStripeCheckoutExpiresAt(farFuture, now);
    expect(resolved.getTime()).toBe(now.getTime() + 24 * 60 * 60 * 1000);
  });

  it('detects active checkout session by expiry', () => {
    const future = new Date(Date.now() + 60_000);
    expect(
      isCheckoutSessionStillActive({
        stripeCheckoutSessionId: 'cs_test',
        checkoutUrl: 'https://checkout.stripe.test',
        checkoutExpiresAt: future,
      }),
    ).toBe(true);
    expect(
      isCheckoutSessionStillActive({
        stripeCheckoutSessionId: 'cs_test',
        checkoutUrl: 'https://checkout.stripe.test',
        checkoutExpiresAt: new Date(Date.now() - 60_000),
      }),
    ).toBe(false);
  });
});
