import {
  applyElectrificationHvSafety,
  applyVariantConfidenceGate,
  coerceHvBatteryPresent,
  normalizeDrivetrain,
  normalizeVehicleSpecValues,
} from './vehicle-spec-ai.normalize.util';

describe('vehicle-spec-ai.normalize.util', () => {
  it('coerces hvBatteryPresent to boolean', () => {
    expect(coerceHvBatteryPresent(1)).toBe(true);
    expect(coerceHvBatteryPresent(0)).toBe(false);
    expect(coerceHvBatteryPresent('true')).toBe(true);
    expect(coerceHvBatteryPresent('bogus')).toBeNull();
  });

  it('normalizes drivetrain including 4WD alias', () => {
    expect(normalizeDrivetrain('4WD')).toBe('FOUR_WD');
    expect(normalizeDrivetrain('fwd')).toBe('FWD');
    expect(normalizeDrivetrain('unknown')).toBeNull();
  });

  it('nulls variant-dependent numerics when confidence is low', () => {
    const specs: Record<string, string | number | boolean | null> = {
      variantConfidence: 0.4,
      curbWeightKg: 1800,
      systemMotorPowerKw: 150,
    };
    const rejected = applyVariantConfidenceGate(specs);
    expect(rejected.length).toBeGreaterThan(0);
    expect(specs.curbWeightKg).toBeNull();
    expect(specs.systemMotorPowerKw).toBeNull();
  });

  it('clears HV capacity fields for MHEV electrification level', () => {
    const specs = normalizeVehicleSpecValues({
      electrificationLevel: 'MHEV_48V',
      hvBatteryUsableCapacityKwh: 15,
      hvBatteryPresent: true,
    });
    expect(specs.hvBatteryPresent).toBe(false);
    expect(specs.hvBatteryUsableCapacityKwh).toBeNull();
  });
});
