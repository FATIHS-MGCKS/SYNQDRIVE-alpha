import { BookingCancellationFeeService } from './booking-cancellation-fee.service';

describe('BookingCancellationFeeService', () => {
  const prisma = {
    organizationRentalRules: { findUnique: jest.fn() },
    bookingPriceSnapshot: { findUnique: jest.fn() },
  };

  const service = new BookingCancellationFeeService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns zero fee when no cancellation policy is configured', async () => {
    prisma.organizationRentalRules.findUnique.mockResolvedValue(null);
    prisma.bookingPriceSnapshot.findUnique.mockResolvedValue({
      totalGrossCents: 10_000,
      currency: 'EUR',
    });

    const result = await service.computeFee({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      effectiveAt: new Date('2026-01-01T10:00:00.000Z'),
      pickupAt: new Date('2026-01-05T10:00:00.000Z'),
    });

    expect(result.feeCents).toBe(0);
    expect(result.waived).toBe(true);
    expect(result.waiverReason).toBe('NO_CANCELLATION_FEE_POLICY');
  });

  it('waives fee inside free cancellation window', async () => {
    prisma.organizationRentalRules.findUnique.mockResolvedValue({
      cancellationFeePercentBps: 5000,
      cancellationFreeHoursBeforePickup: 48,
      cancellationMinFeeCents: 1000,
      cancellationMaxFeeCents: null,
      depositCurrency: 'EUR',
    });
    prisma.bookingPriceSnapshot.findUnique.mockResolvedValue({
      totalGrossCents: 20_000,
      currency: 'EUR',
    });

    const result = await service.computeFee({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      effectiveAt: new Date('2026-01-01T10:00:00.000Z'),
      pickupAt: new Date('2026-01-05T10:00:00.000Z'),
    });

    expect(result.feeCents).toBe(0);
    expect(result.waiverReason).toBe('WITHIN_FREE_CANCELLATION_WINDOW');
  });

  it('computes percent-based fee with min and max bounds', async () => {
    prisma.organizationRentalRules.findUnique.mockResolvedValue({
      cancellationFeePercentBps: 1000,
      cancellationFreeHoursBeforePickup: null,
      cancellationMinFeeCents: 2500,
      cancellationMaxFeeCents: 3000,
      depositCurrency: 'EUR',
    });
    prisma.bookingPriceSnapshot.findUnique.mockResolvedValue({
      totalGrossCents: 10_000,
      currency: 'EUR',
    });

    const result = await service.computeFee({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      effectiveAt: new Date('2026-01-04T10:00:00.000Z'),
      pickupAt: new Date('2026-01-05T10:00:00.000Z'),
    });

    expect(result.feeCents).toBe(2500);
    expect(result.waived).toBe(false);
  });
});
