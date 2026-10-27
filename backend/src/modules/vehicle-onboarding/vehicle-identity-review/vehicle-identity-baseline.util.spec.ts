import { mapMotionReferencePowerProvenance, buildVehicleSystemBaseline } from './vehicle-identity-baseline.util';

describe('vehicle-identity-baseline.util', () => {
  it('maps MISTRAL_AI reference to AI_ESTIMATED, not DIMO', () => {
    expect(
      mapMotionReferencePowerProvenance('MISTRAL_AI', 'ESTIMATED'),
    ).toBe('AI_ESTIMATED');
  });

  it('maps operator-confirmed reference to USER_CONFIRMED', () => {
    expect(
      mapMotionReferencePowerProvenance('OPERATOR_CONFIRMED', 'CONFIRMED'),
    ).toBe('USER_CONFIRMED');
  });

  it('uses DIMO provenance only when provider link exists', () => {
    const withDimo = buildVehicleSystemBaseline({
      vin: 'VIN123',
      make: 'VW',
      model: 'Golf',
      fuelType: 'Diesel',
      hasDimoProviderLink: true,
      motionReference: null,
    });
    expect(withDimo.make.provenance).toBe('DIMO_PROVIDER');
    expect(withDimo.fuelType.provenance).toBe('UNCONFIRMED');

    const withoutDimo = buildVehicleSystemBaseline({
      vin: 'VIN123',
      make: 'VW',
      model: 'Golf',
      fuelType: 'Diesel',
      hasDimoProviderLink: false,
      motionReference: null,
    });
    expect(withoutDimo.make.provenance).toBe('UNCONFIRMED');
    expect(withoutDimo.displacementCc.value).toBeNull();
  });

  it('prefills kW from motion reference with correct provenance', () => {
    const baseline = buildVehicleSystemBaseline({
      vin: null,
      make: null,
      model: null,
      fuelType: null,
      hasDimoProviderLink: false,
      motionReference: {
        systemMotorPowerKw: 110,
        source: 'MISTRAL_AI',
        evidenceTier: 'ESTIMATED',
      },
    });
    expect(baseline.motorPowerKw.value).toBe(110);
    expect(baseline.motorPowerKw.provenance).toBe('AI_ESTIMATED');
  });
});
