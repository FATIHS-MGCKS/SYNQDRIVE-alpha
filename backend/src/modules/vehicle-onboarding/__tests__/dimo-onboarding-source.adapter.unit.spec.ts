import { buildDimoOnboardingSourceSnapshot } from '../adapters/dimo-onboarding-source.adapter';

describe('Dimo onboarding source adapter', () => {
  it('never fabricates synthetic DIMO VIN', () => {
    const snap = buildDimoOnboardingSourceSnapshot({
      id: 'dv-1',
      externalId: 'ext-99',
      vin: null,
      make: null,
      model: null,
      year: null,
      fuelType: null,
      updatedAt: new Date(),
    });
    expect(snap.vin).toBeNull();
    expect(snap.externalVehicleIdentity).toBe('ext-99');
  });

  it('preserves provider VIN as unverified', () => {
    const snap = buildDimoOnboardingSourceSnapshot({
      id: 'dv-2',
      externalId: 'ext-2',
      vin: 'WVWZZZ1JZXW000001',
      make: 'VW',
      model: 'Golf',
      year: 2020,
      fuelType: 'GASOLINE',
      updatedAt: new Date(),
    });
    expect(snap.vin).toBe('WVWZZZ1JZXW000001');
    expect(snap.vinVerificationState).toBe('UNVERIFIED');
  });
});
