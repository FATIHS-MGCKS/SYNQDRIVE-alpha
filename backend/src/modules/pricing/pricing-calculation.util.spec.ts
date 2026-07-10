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

  const sedanDepositRate = {
    ...baseRate,
    dailyRateCents: 4958, // ~59€ gross at 19%
    depositAmountCents: 50000,
  };

  const pickup = new Date('2026-06-01T10:00:00Z');
  const return3 = new Date('2026-06-04T10:00:00Z');
  const return8 = new Date('2026-06-09T10:00:00Z');

  const simulate = (overrides: Partial<Parameters<typeof simulateBookingPrice>[0]> = {}) =>
    simulateBookingPrice({
      pickupAt: pickup,
      returnAt: return3,
      taxRatePercent: 19,
      rate: baseRate,
      ...overrides,
    });

  it('computes 3-day daily rate', () => {
    const base = computeBaseRentalNetCents(3, baseRate);
    expect(base.netCents).toBe(15000);
  });

  it('computes 8-day weekly + remainder', () => {
    const base = computeBaseRentalNetCents(8, baseRate);
    expect(base.netCents).toBe(27500 + 5000);
  });

  it('multiplies PER_DAY insurance by rental days', () => {
    const result = simulate({
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
    const result = simulate({
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
    const result = simulate({ manualDiscountCents: 50000 });
    expect(result.subtotalNetCents).toBe(0);
    expect(result.totalGrossCents).toBeGreaterThanOrEqual(0);
  });

  describe('deposit business rules', () => {
    it('stores 50000 cents as depositAmountCents (€500 display value)', () => {
      const result = simulate({ rate: sedanDepositRate });
      expect(result.depositAmountCents).toBe(50000);
      const deposit = result.lineItems.find((li) => li.type === 'DEPOSIT');
      expect(deposit?.totalGrossCents).toBe(50000);
      expect(deposit?.unitPriceCents).toBe(50000);
    });

    it('does not change deposit when tax rate changes', () => {
      const at19 = simulate({ rate: sedanDepositRate, taxRatePercent: 19 });
      const at7 = simulate({ rate: sedanDepositRate, taxRatePercent: 7 });
      expect(at7.depositAmountCents).toBe(at19.depositAmountCents);
      expect(at7.lineItems.find((li) => li.type === 'DEPOSIT')?.taxRatePercent).toBe(0);
    });

    it('excludes deposit from taxable subtotal and tax amount', () => {
      const result = simulate({ rate: sedanDepositRate });
      const deposit = result.lineItems.find((li) => li.type === 'DEPOSIT')!;
      const rentalGross = result.lineItems
        .filter((li) => li.type === 'BASE_RENTAL')
        .reduce((s, li) => s + li.totalGrossCents, 0);
      expect(result.totalGrossCents).toBe(rentalGross);
      expect(result.subtotalNetCents + result.taxAmountCents).toBe(result.totalGrossCents);
      expect(deposit.totalGrossCents - deposit.totalNetCents).toBe(0);
    });

    it('does not include deposit in extras-like line items', () => {
      const result = simulate({
        rate: sedanDepositRate,
        extras: [{ id: 'e1', label: 'GPS', priceCents: 500, pricingType: 'PER_BOOKING' }],
        insurances: [{ id: 'i1', label: 'CDW', priceCents: 1000, pricingType: 'PER_DAY' }],
        mileagePackage: { id: 'p1', label: '500 km', includedKm: 500, priceCents: 6900 },
      });
      const extrasGross = result.lineItems
        .filter((li) => ['MILEAGE_PACKAGE', 'INSURANCE', 'EXTRA'].includes(li.type))
        .reduce((s, li) => s + li.totalGrossCents, 0);
      expect(extrasGross).toBeLessThan(result.totalGrossCents);
      expect(result.lineItems.some((li) => li.type === 'DEPOSIT' && li.totalGrossCents === 50000)).toBe(true);
    });

    it('does not discount the deposit', () => {
      const withoutDiscount = simulate({ rate: sedanDepositRate });
      const withDiscount = simulate({ rate: sedanDepositRate, manualDiscountCents: 2000 });
      expect(withDiscount.depositAmountCents).toBe(withoutDiscount.depositAmountCents);
      expect(withDiscount.totalDueNowCents).toBe(
        withDiscount.totalGrossCents + withDiscount.depositAmountCents,
      );
    });

    it('adds deposit exactly once to totalDueNow', () => {
      const result = simulate({ rate: sedanDepositRate });
      expect(result.totalDueNowCents).toBe(result.totalGrossCents + result.depositAmountCents);
      expect(result.lineItems.filter((li) => li.type === 'DEPOSIT')).toHaveLength(1);
    });

    it('persists deposit separately on snapshot fields', () => {
      const result = simulate({ rate: sedanDepositRate });
      expect(result.depositAmountCents).toBe(50000);
      expect(result.depositAmountCents).toBe(
        result.lineItems.find((li) => li.type === 'DEPOSIT')?.totalGrossCents,
      );
    });

    it('keeps 17700 → 50000 regression deposit values independent of rental tax', () => {
      const legacy177 = simulate({ rate: { ...sedanDepositRate, depositAmountCents: 17700 } });
      const updated500 = simulate({ rate: { ...sedanDepositRate, depositAmountCents: 50000 } });
      expect(legacy177.depositAmountCents).toBe(17700);
      expect(updated500.depositAmountCents).toBe(50000);
      expect(updated500.totalGrossCents).toBe(legacy177.totalGrossCents);
    });

    it('does not compute tax from deposit line item', () => {
      const result = simulate({ rate: sedanDepositRate });
      const deposit = result.lineItems.find((li) => li.type === 'DEPOSIT')!;
      expect(deposit.taxRatePercent).toBe(0);
      expect(deposit.totalGrossCents - deposit.totalNetCents).toBe(0);
      const taxableTax = result.lineItems
        .filter((li) => li.type !== 'DEPOSIT')
        .reduce((s, li) => s + (li.totalGrossCents - li.totalNetCents), 0);
      expect(result.taxAmountCents).toBe(taxableTax);
    });
  });
});
