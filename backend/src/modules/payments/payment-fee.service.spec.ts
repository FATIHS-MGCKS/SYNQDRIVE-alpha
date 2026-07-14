import { BookingPriceLineItemType } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PaymentFeeService } from './payment-fee.service';
import {
  PaymentPolicyService,
  computeCommissionableAmountFromLineItems,
} from './payment-policy.service';
import { PaymentFeeBasis, PAYMENT_FEE_POLICY_VERSION } from './payment-fee.types';
import { MissingPriceSnapshotError, NegativeCommissionableError } from './payment-fee.errors';

describe('PaymentFeeService', () => {
  const prisma = {
    bookingPriceSnapshot: {
      findFirst: jest.fn(),
    },
  };

  const configService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const map: Record<string, string> = {
        PAYMENT_FEE_RATE_BPS: '300',
        PAYMENT_FEE_FIXED_CENTS: '25',
      };
      return map[key] ?? defaultValue;
    }),
  };

  const policyService = new PaymentPolicyService(configService as unknown as ConfigService);
  const service = new PaymentFeeService(prisma as never, policyService);

  const sampleLineItems = [
    {
      type: BookingPriceLineItemType.BASE_RENTAL,
      totalNetCents: 10_000,
      totalGrossCents: 11_900,
    },
    {
      type: BookingPriceLineItemType.EXTRA,
      totalNetCents: 2_000,
      totalGrossCents: 2_380,
    },
    {
      type: BookingPriceLineItemType.DEPOSIT,
      totalNetCents: 50_000,
      totalGrossCents: 50_000,
    },
  ];

  beforeEach(() => jest.clearAllMocks());

  it('builds fee snapshot from booking price snapshot line items', async () => {
    prisma.bookingPriceSnapshot.findFirst.mockResolvedValue({
      currency: 'EUR',
      totalDueNowCents: 64_280,
      depositAmountCents: 50_000,
      lineItems: sampleLineItems,
    });

    const snapshot = await service.buildFeeSnapshotForBooking('org-1', 'bk-1');

    expect(snapshot.rentalPaymentAmountCents).toBe(14_280);
    expect(snapshot.commissionableAmountCents).toBe(14_280);
    expect(snapshot.rentalPaymentAmountCents).not.toBe(64_280);
    expect(snapshot.feeRateBps).toBe(300);
    expect(snapshot.fixedFeeCents).toBe(25);
    expect(snapshot.feePolicyVersion).toBe(PAYMENT_FEE_POLICY_VERSION);
    expect(snapshot.applicationFeeAmountCents).toBe(
      Math.round((14_280 * 300) / 10_000) + 25,
    );
  });

  it('throws when price snapshot is missing', async () => {
    prisma.bookingPriceSnapshot.findFirst.mockResolvedValue(null);
    await expect(service.buildFeeSnapshotForBooking('org-1', 'bk-missing')).rejects.toBeInstanceOf(
      MissingPriceSnapshotError,
    );
  });

  it('throws on negative commissionable amount', () => {
    expect(() =>
      service.buildFeeSnapshotFromLineItems(
        [
          {
            type: BookingPriceLineItemType.BASE_RENTAL,
            totalNetCents: 1_000,
            totalGrossCents: 1_190,
          },
          {
            type: BookingPriceLineItemType.DISCOUNT,
            totalNetCents: -5_000,
            totalGrossCents: -5_950,
          },
        ],
        {
          version: PAYMENT_FEE_POLICY_VERSION,
          basis: PaymentFeeBasis.GROSS_RENTAL_EXCL_DEPOSIT,
          feeRateBps: 250,
          fixedFeeCents: 0,
          minFeeCents: null,
          maxFeeCents: null,
          currency: 'EUR',
        },
        'EUR',
      ),
    ).toThrow(NegativeCommissionableError);
  });

  it('toImmutablePaymentRequestFields preserves snapshot for later policy changes', () => {
    const feeSnapshot = service.buildFeeSnapshotFromLineItems(
      sampleLineItems,
      {
        version: PAYMENT_FEE_POLICY_VERSION,
        basis: PaymentFeeBasis.GROSS_RENTAL_EXCL_DEPOSIT,
        feeRateBps: 300,
        fixedFeeCents: 25,
        minFeeCents: null,
        maxFeeCents: null,
        currency: 'EUR',
      },
      'EUR',
    );

    const persisted = service.toImmutablePaymentRequestFields(feeSnapshot);

    const newPolicyFee = computeCommissionableAmountFromLineItems(
      sampleLineItems,
      PaymentFeeBasis.NET_RENTAL_EXCL_DEPOSIT,
      'EUR',
    );
    expect(newPolicyFee.commissionableAmountCents).not.toBe(persisted.commissionableAmountCents);
    expect(persisted.feePolicyVersion).toBe(PAYMENT_FEE_POLICY_VERSION);
    expect(persisted.feeRateBps).toBe(300);
    expect(persisted.amountCents).toBe(14_280);
  });

  it('calculates refund fee adjustment from stored snapshot', () => {
    const feeSnapshot = service.buildFeeSnapshotFromLineItems(
      [
        {
          type: BookingPriceLineItemType.BASE_RENTAL,
          totalNetCents: 10_000,
          totalGrossCents: 10_000,
        },
      ],
      {
        version: PAYMENT_FEE_POLICY_VERSION,
        basis: PaymentFeeBasis.GROSS_RENTAL_EXCL_DEPOSIT,
        feeRateBps: 500,
        fixedFeeCents: 0,
        minFeeCents: null,
        maxFeeCents: null,
        currency: 'EUR',
      },
      'EUR',
    );

    const partial = service.calculateRefundFee(feeSnapshot, 2_500);
    expect(partial.applicationFeeRefundCents).toBe(125);

    const full = service.calculateRefundFee(feeSnapshot, 10_000);
    expect(full.applicationFeeRefundCents).toBe(feeSnapshot.applicationFeeAmountCents);
    expect(full.isFullRefund).toBe(true);
  });
});
