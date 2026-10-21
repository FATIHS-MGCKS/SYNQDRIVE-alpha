import { manualOnboardingRequestFingerprint } from '../policy/manual-onboarding-idempotency.fingerprint';
describe('manual onboarding idempotency fingerprint', () => {
  const base = {
    vin: 'VIN1',
    make: 'VW',
    model: 'Golf',
    year: 2020,
    fuelType: 'GASOLINE',
    vehicleName: 'Fleet 1',
    licensePlate: 'M-AB-1',
    stationId: 'station-1',
    notes: 'note',
  };

  it('changes when license plate changes', () => {
    const a = manualOnboardingRequestFingerprint(base);
    const b = manualOnboardingRequestFingerprint({ ...base, licensePlate: 'M-AB-2' });
    expect(a).not.toBe(b);
  });

  it('is stable for equivalent normalized input', () => {
    const a = manualOnboardingRequestFingerprint(base);
    const b = manualOnboardingRequestFingerprint({
      ...base,
      licensePlate: ' M-AB-1 ',
    });
    expect(a).toBe(b);
  });
});
