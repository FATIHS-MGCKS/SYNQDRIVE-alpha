import { describe, expect, it } from 'vitest';
import {
  buildTechnicalSpecsView,
  motionPhysicsEvidenceTierLabelKey,
} from './connected-vehicle-technical-specs.util';

describe('connected-vehicle-technical-specs.util', () => {
  it('prefers vehicle curb weight over reference when both present', () => {
    const view = buildTechnicalSpecsView({
      make: 'VW',
      model: 'Tiguan',
      year: 2021,
      fuelType: 'Gasoline',
      curbWeight: '1750',
      motionReference: { curbMassKg: 1800, systemMotorPowerKw: 110, accel0To100S: 9.2 },
    });
    expect(view.curbWeightKg).toBe(1750);
    expect(view.systemMotorPowerKw).toBe(110);
  });

  it('falls back to motion reference for power and acceleration', () => {
    const view = buildTechnicalSpecsView({
      make: 'Tesla',
      model: 'Model 3',
      fuelType: 'Electric',
      motionReference: { systemMotorPowerKw: 210, accel0To100S: 5.8, variantAssumption: 'LR RWD' },
    });
    expect(view.systemMotorPowerKw).toBe(210);
    expect(view.accel0To100S).toBe(5.8);
    expect(view.variantAssumption).toBe('LR RWD');
  });

  it('maps evidence tier to i18n keys', () => {
    expect(motionPhysicsEvidenceTierLabelKey('ESTIMATED')).toBe('master.motionPhysics.evidence.estimated');
    expect(motionPhysicsEvidenceTierLabelKey(null)).toBe('master.cv.technicalSpecs.noReference');
  });
});
