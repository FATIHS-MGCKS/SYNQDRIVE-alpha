import { describe, expect, it } from 'vitest';
import {
  buildTechnicalSpecsView,
  motionPhysicsEvidenceTierLabelKey,
} from './connected-vehicle-technical-specs.util';

describe('connected-vehicle-technical-specs.util', () => {
  it('prefers active reference over legacy vehicle values when reference exists', () => {
    const view = buildTechnicalSpecsView({
      make: 'VW',
      model: 'Tiguan',
      year: 2021,
      fuelType: 'Gasoline',
      curbWeight: '1750',
      systemMotorPowerKw: '100',
      accel0To100S: '10',
      motionReference: {
        curbMassKg: 1800,
        systemMotorPowerKw: 110,
        accel0To100S: 9.2,
        variantAssumption: '2.0 TSI',
      },
    });
    expect(view.curbWeightKg).toBe(1800);
    expect(view.systemMotorPowerKw).toBe(110);
    expect(view.accel0To100S).toBe(9.2);
    expect(view.variantAssumption).toBe('2.0 TSI');
    expect(view.frontToRearWeightDistribution).toBe('—');
  });

  it('falls back to legacy vehicle fields when no reference values', () => {
    const view = buildTechnicalSpecsView({
      make: 'Tesla',
      model: 'Model 3',
      fuelType: 'Electric',
      curbWeight: '1847',
      systemMotorPowerKw: '210',
      accel0To100S: '5.8',
    });
    expect(view.curbWeightKg).toBe(1847);
    expect(view.systemMotorPowerKw).toBe(210);
    expect(view.accel0To100S).toBe(5.8);
  });

  it('maps evidence tier to i18n keys', () => {
    expect(motionPhysicsEvidenceTierLabelKey('ESTIMATED')).toBe('master.motionPhysics.evidence.estimated');
    expect(motionPhysicsEvidenceTierLabelKey(null)).toBe('master.cv.technicalSpecs.noReference');
  });
});
