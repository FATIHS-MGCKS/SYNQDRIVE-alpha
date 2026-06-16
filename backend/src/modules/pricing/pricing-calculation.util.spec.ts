import {
  computeBaseRentalNetCents,
  simulateBookingPrice,
} from './pricing-calculation.util';

describe('pricing-calculation.util', () => {
  const baseRate = {
    dailyRateCents: 5000,
    weeklyRateCents: 27500,
    monthlyRateCents: 100000,
    includedKmPerDay: 200,
    extraKmPriceCents: 22,
    depositAmountCents: 15000,
  };

  const pickup = new Date('2026-06-01T10:00:00Z');
  const return3 = new Date('2026-06-04T10:00:00Z');
  const return8 = new Date('2026-06-09T10:00:00Z');

  it('computes 3-day daily rate', () => {
    const base = computeBaseRentalNetCents(3, baseRate);
    expect(base.netCents).toBe(15000);
  });

  it('computes 8-day weekly + remainder', () => {
    const base = computeBaseRentalNetCents(8, baseRate);
    expect(base.netCents).toBe(27500 + 5000);
  });

  it('multiplies PER_DAY insurance by rental days', () => {
    const result = simulateBookingPrice({
      pickupAt: pickup,
      returnAt: return3,
      taxRatePercent: 19,
      rate: baseRate,
      insurances: [
        {
          id: 'ins-1',
          label: 'CDW',
          priceCents: 1000,
          pricingType: 'PER_DAY',
        },
      ],
    });
    const ins = result.lineItems.find((li) => li.type === 'INSURANCE');
    expect(ins?.quantity).toBe(3);
    expect(ins?.totalNetCents).toBe(3000);
  });

  it('charges PER_BOOKING extra once', () => {
    const result = simulateBookingPrice({
      pickupAt: pickup,
      returnAt: return8,
      taxRatePercent: 19,
      rate: baseRate,
      extras: [
        {
          id: 'ext-1',
          label: 'GPS',
          priceCents: 500,
          pricingType: 'PER_BOOKING',
        },
      ],
    });
    const extra = result.lineItems.find((li) => li.type === 'EXTRA');
    expect(extra?.quantity).toBe(1);
    expect(extra?.totalNetCents).toBe(500);
  });

  it('adds mileage package and deposit separately', () => {
    const result = simulateBookingPrice({
      pickupAt: pickup,
      returnAt: return3,
      taxRatePercent: 19,
      rate: baseRate,
      mileagePackage: {
        id: 'pkg-1',
        label: '500 km',
        includedKm: 500,
        priceCents: 6900,
      },
    });
    expect(result.includedKm).toBe(200 * 3 + 500);
    expect(result.depositAmountCents).toBe(15000);
    const deposit = result.lineItems.find((li) => li.type === 'DEPOSIT');
    expect(deposit).toBeDefined();
    expect(result.totalDueNowCents).toBe(result.totalGrossCents + 15000);
  });

  it('rejects negative totals in discount handling', () => {
    const result = simulateBookingPrice({
      pickupAt: pickup,
      returnAt: return3,
      taxRatePercent: 19,
      rate: baseRate,
      manualDiscountCents: 50000,
    });
    expect(result.subtotalNetCents).toBe(0);
    expect(result.totalGrossCents).toBeGreaterThanOrEqual(0);
  });
});
