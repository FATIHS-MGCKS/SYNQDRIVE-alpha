import {
  parseLocaleDecimalMm,
  validateOdometerKm,
  validateTireTreadMeasurementMm,
} from './tire-measurement-validation.util';

describe('tire-measurement-validation.util', () => {
  it('accepts valid tread values in mm', () => {
    const result = validateTireTreadMeasurementMm({
      frontLeftMm: 5.8,
      frontRightMm: 5.5,
      rearLeftMm: 4.2,
      rearRightMm: 4.0,
    });
    expect(result.errors).toHaveLength(0);
    expect(result.values.frontLeftMm).toBe(5.8);
  });

  it('rejects negative values', () => {
    const result = validateTireTreadMeasurementMm({ frontLeftMm: -0.5 });
    expect(result.errors.some((e) => e.includes('Negativer'))).toBe(true);
  });

  it('rejects unrealistic values above 20 mm', () => {
    const result = validateTireTreadMeasurementMm({ rearRightMm: 25 });
    expect(result.errors.some((e) => e.includes('20'))).toBe(true);
  });

  it('parses comma and dot decimals', () => {
    expect(parseLocaleDecimalMm('5,8')).toBe(5.8);
    expect(parseLocaleDecimalMm('4.2')).toBe(4.2);
    expect(parseLocaleDecimalMm('')).toBeNull();
    expect(parseLocaleDecimalMm('abc')).toBeNull();
  });

  it('warns on axle difference without blocking', () => {
    const result = validateTireTreadMeasurementMm({
      frontLeftMm: 6,
      frontRightMm: 3,
    });
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('Vorderachse'))).toBe(true);
  });

  it('validates odometer bounds', () => {
    expect(validateOdometerKm(-1)).toMatch(/nicht-negative/);
    expect(validateOdometerKm(120_000)).toBeNull();
  });
});
