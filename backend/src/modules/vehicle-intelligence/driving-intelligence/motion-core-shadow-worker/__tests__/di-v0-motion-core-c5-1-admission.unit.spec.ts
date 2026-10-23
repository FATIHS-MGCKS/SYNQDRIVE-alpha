import {
  isC5_1PreferredSpeedEffective,
  resolveC5_1PlausibilityClassForEligibleVehicle,
  resolveC5_1VehicleAdmissionFromLabels,
} from '../di-v0-motion-core-c5-1-admission';
import type { DiV0MotionCoreShadowControlPlaneConfig } from '../di-v0-motion-core-shadow-control-plane';

function controlPlane(overrides: Partial<DiV0MotionCoreShadowControlPlaneConfig> = {}): DiV0MotionCoreShadowControlPlaneConfig {
  return {
    shadowEnabled: true,
    workerEnabled: true,
    c5_1PreferredSpeedEnabled: true,
    c5_1ActivationSince: new Date('2026-10-23T20:30:00.000Z'),
    organizationAllowlist: new Set(['org']),
    vehicleAllowlist: new Set(['veh']),
    ...overrides,
  };
}

describe('C5.1 admission and activation cutoff', () => {
  it('admits Tesla and Tiguan only (no silent TESLA fallback for other OEMs)', () => {
    expect(resolveC5_1VehicleAdmissionFromLabels('Tesla', 'Model 3')).toBe('C5_1_ELIGIBLE');
    expect(resolveC5_1VehicleAdmissionFromLabels('Volkswagen', 'Tiguan')).toBe('C5_1_ELIGIBLE');
    expect(resolveC5_1VehicleAdmissionFromLabels('Volkswagen', 'Arteon')).toBe('C4_SHADOW_ONLY');
    expect(resolveC5_1VehicleAdmissionFromLabels('Audi', 'A4')).toBe('C4_SHADOW_ONLY');
  });

  it('maps plausibility only for explicitly admitted vehicles', () => {
    expect(resolveC5_1PlausibilityClassForEligibleVehicle('Volkswagen', 'Tiguan')).toBe('TIGUAN');
    expect(resolveC5_1PlausibilityClassForEligibleVehicle('Tesla', 'Model 3')).toBe('TESLA');
  });

  it('blocks V2 when trip completed before activation cutoff', () => {
    const cp = controlPlane();
    const before = new Date('2026-10-23T20:00:00.000Z');
    expect(
      isC5_1PreferredSpeedEffective(cp, {
        vehicleAdmission: 'C5_1_ELIGIBLE',
        workItemCompletedAt: before,
      }),
    ).toBe(false);
    const after = new Date('2026-10-23T21:00:00.000Z');
    expect(
      isC5_1PreferredSpeedEffective(cp, {
        vehicleAdmission: 'C5_1_ELIGIBLE',
        workItemCompletedAt: after,
      }),
    ).toBe(true);
  });

  it('keeps Arteon on C4 shadow path when global C5.1 flag is on', () => {
    const cp = controlPlane();
    expect(
      isC5_1PreferredSpeedEffective(cp, {
        vehicleAdmission: 'C4_SHADOW_ONLY',
        workItemCompletedAt: new Date('2026-10-23T21:00:00.000Z'),
      }),
    ).toBe(false);
  });

  it('is fully off when C5.1 flag is off', () => {
    const cp = controlPlane({ c5_1PreferredSpeedEnabled: false });
    expect(
      isC5_1PreferredSpeedEffective(cp, {
        vehicleAdmission: 'C5_1_ELIGIBLE',
        workItemCompletedAt: new Date('2026-10-23T21:00:00.000Z'),
      }),
    ).toBe(false);
  });
});
