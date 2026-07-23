import { BookingDepositSnapshotService } from './booking-deposit-snapshot.service';
import { toFrozenBookingDeposit } from './frozen-booking-deposit.types';
import { DEPOSIT_SOURCE } from './deposit-resolver.types';

describe('BookingDepositSnapshotService', () => {
  it('freezes deposit metadata on snapshot confirm', async () => {
    const prisma = {
      bookingPriceSnapshot: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'snap-1',
          depositAmountCents: 60_000,
          currency: 'EUR',
          pricingInputJson: {
            frozenDeposit: toFrozenBookingDeposit({
              amount: 60_000,
              currency: 'EUR',
              source: DEPOSIT_SOURCE.CATEGORY_MINIMUM,
              ruleRevisionId: 'cat-1',
              reason: 'Category minimum',
              manualOverride: false,
              calculatedAt: '2026-07-23T12:00:00.000Z',
              components: {
                rentalRulesFloorCents: 60_000,
                tariffDepositCents: 30_000,
                effectiveMinimumCents: 60_000,
                raisedToMinimum: true,
              },
            }),
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      bookingDeposit: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      booking: {
        findFirst: jest.fn(),
      },
    };

    const service = new BookingDepositSnapshotService(prisma as never);
    const frozen = await service.freezeDepositOnSnapshot('org-1', 'booking-1');

    expect(frozen?.frozenAt).toBeTruthy();
    expect(prisma.bookingPriceSnapshot.update).toHaveBeenCalled();
    expect(prisma.bookingDeposit.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ amountCents: 60_000 }),
      }),
    );
  });
});
