import {
  applyVehicleSpecMotionPlausibility,
  rejectMotionFieldsForIdentityMismatch,
} from './vehicle-spec-ai.plausibility.util';

describe('vehicle-spec-ai.plausibility', () => {
  it('rejects curb weight outside plausible range', () => {
    const { specs, rejectedFields } = applyVehicleSpecMotionPlausibility({
      curbWeightKg: 500,
      systemMotorPowerKw: 100,
    });
    expect(specs.curbWeightKg).toBeNull();
    expect(rejectedFields).toContain('curbWeightKg');
  });

  it('rejects implausible power-to-mass ratio', () => {
    const { specs, rejectedFields } = applyVehicleSpecMotionPlausibility({
      curbWeightKg: 700,
      systemMotorPowerKw: 300,
    });
    expect(specs.systemMotorPowerKw).toBeNull();
    expect(rejectedFields.some((f) => f.startsWith('systemMotorPowerKw'))).toBe(true);
  });

  it('strips motion fields when AI MMY disagrees with vehicle context', () => {
    const specs = {
      make: 'BMW',
      model: 'i4',
      year: 2024,
      systemMotorPowerKw: 250,
      curbWeightKg: 2100,
    };
    const rejected = rejectMotionFieldsForIdentityMismatch(specs, {
      make: 'Tesla',
      model: 'Model 3',
      year: 2023,
    });
    expect(rejected).toContain('motion_fields:identity_mmy_mismatch');
    expect(specs.systemMotorPowerKw).toBeNull();
    expect(specs.curbWeightKg).toBeNull();
  });

  it('does not synthesize variant assumption when motion fields present', () => {
    const { specs } = applyVehicleSpecMotionPlausibility(
      { systemMotorPowerKw: 150, curbWeightKg: 1800 },
      { make: 'VW', model: 'ID.4', year: 2023 },
    );
    expect(specs.variantAssumption == null || String(specs.variantAssumption).trim() === '').toBe(
      true,
    );
  });
});
