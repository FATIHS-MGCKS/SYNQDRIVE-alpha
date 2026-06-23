import { buildEffectiveRentalRules } from './rental-effective-rules.util';

describe('buildEffectiveRentalRules', () => {
  const orgLayer = {
    source: 'ORGANIZATION_DEFAULT' as const,
    sourceName: 'Acme Rental',
    values: {
      minimumAgeYears: 21,
      minimumLicenseHoldingMonths: 12,
      depositAmountCents: 50000,
      depositCurrency: 'EUR',
      creditCardRequired: true,
      foreignTravelPolicy: 'ALLOWED' as const,
      additionalDriverPolicy: 'ALLOWED' as const,
      youngDriverPolicy: 'FEE_REQUIRED' as const,
      insuranceRequirement: 'Full coverage',
      manualApprovalRequired: false,
      notes: 'Org default',
    },
  };

  const baseInput = {
    organizationId: 'org1',
    vehicleId: 'veh1',
    orgLayer,
    categoryLayer: null,
    vehicleLayer: null,
    rentalCategoryId: null,
    rentalCategoryName: null,
    rentalCategoryType: null,
    rulesActive: true,
  };

  it('uses organization defaults when no category or override', () => {
    const result = buildEffectiveRentalRules(baseInput);
    expect(result.minimumAgeYears).toEqual({
      value: 21,
      source: 'ORGANIZATION_DEFAULT',
      sourceName: 'Acme Rental',
    });
    expect(result.depositAmountCents.value).toBe(50000);
    expect(result.depositAmountCents.source).toBe('ORGANIZATION_DEFAULT');
  });

  it('category overrides organization defaults', () => {
    const result = buildEffectiveRentalRules({
      ...baseInput,
      rentalCategoryId: 'cat1',
      rentalCategoryName: 'Performance',
      categoryLayer: {
        source: 'CATEGORY',
        sourceName: 'Performance',
        values: {
          minimumAgeYears: 25,
          depositAmountCents: 250000,
        },
      },
    });
    expect(result.minimumAgeYears).toEqual({
      value: 25,
      source: 'CATEGORY',
      sourceName: 'Performance',
    });
    expect(result.depositAmountCents).toEqual({
      value: 250000,
      source: 'CATEGORY',
      sourceName: 'Performance',
    });
    expect(result.creditCardRequired).toEqual({
      value: true,
      source: 'ORGANIZATION_DEFAULT',
      sourceName: 'Acme Rental',
    });
  });

  it('vehicle override wins over category and organization', () => {
    const result = buildEffectiveRentalRules({
      ...baseInput,
      rentalCategoryId: 'cat1',
      rentalCategoryName: 'Performance',
      categoryLayer: {
        source: 'CATEGORY',
        sourceName: 'Performance',
        values: { minimumAgeYears: 25, depositAmountCents: 250000 },
      },
      vehicleLayer: {
        source: 'VEHICLE_OVERRIDE',
        sourceName: 'Tesla Model 3 Performance',
        values: { depositAmountCents: 300000 },
      },
    });
    expect(result.depositAmountCents).toEqual({
      value: 300000,
      source: 'VEHICLE_OVERRIDE',
      sourceName: 'Tesla Model 3 Performance',
    });
    expect(result.minimumAgeYears.source).toBe('CATEGORY');
  });

  it('null override field stays inherited from category', () => {
    const result = buildEffectiveRentalRules({
      ...baseInput,
      categoryLayer: {
        source: 'CATEGORY',
        sourceName: 'Premium',
        values: { minimumAgeYears: 23 },
      },
      vehicleLayer: {
        source: 'VEHICLE_OVERRIDE',
        sourceName: 'BMW 5',
        values: { minimumAgeYears: null, depositAmountCents: null },
      },
    });
    expect(result.minimumAgeYears).toEqual({
      value: 23,
      source: 'CATEGORY',
      sourceName: 'Premium',
    });
  });
});
