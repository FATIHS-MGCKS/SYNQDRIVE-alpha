import {
  loadVehicleRegistrationConvergenceConfigFromEnv,
  VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL_ENV,
  VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL_NOT_ARMABLE_PR1,
  VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED_ENV,
  VEHICLE_REGISTRATION_CONVERGENCE_SHADOW_COMPARE_ENV,
} from './vehicle-registration-convergence.config';
import {
  isHmOnlyCanonicalRoutingEnabled,
  isHmOnlyShadowCompareEnabled,
} from '@modules/vehicle-onboarding/convergence/vehicle-registration-convergence.routing';

describe('vehicleRegistrationConvergenceConfig (V2B-PR1)', () => {
  const baseEnv = {
    ...process.env,
    [VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED_ENV]: '',
    [VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL_ENV]: '',
    [VEHICLE_REGISTRATION_CONVERGENCE_SHADOW_COMPARE_ENV]: '',
  };

  it('both flags OFF = legacy routing parity', () => {
    const config = loadVehicleRegistrationConvergenceConfigFromEnv(baseEnv);
    expect(config.hmOnlyCanonicalEnabled).toBe(false);
    expect(config.billingSingleRailEnabled).toBe(false);
    expect(config.shadowCompareEnabled).toBe(false);
    expect(isHmOnlyCanonicalRoutingEnabled(config)).toBe(false);
    expect(isHmOnlyShadowCompareEnabled(config)).toBe(false);
  });

  it('shadow compare defaults OFF and is inert when canonical routing ON', () => {
    const config = loadVehicleRegistrationConvergenceConfigFromEnv({
      ...baseEnv,
      [VEHICLE_REGISTRATION_CONVERGENCE_SHADOW_COMPARE_ENV]: 'true',
      [VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED_ENV]: 'true',
    });
    expect(config.shadowCompareEnabled).toBe(true);
    expect(isHmOnlyShadowCompareEnabled(config)).toBe(false);
  });

  it('billing flag ON alone is rejected at startup (NOT_ARMABLE PR1)', () => {
    expect(() =>
      loadVehicleRegistrationConvergenceConfigFromEnv({
        ...baseEnv,
        [VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL_ENV]: 'true',
      }),
    ).toThrow(VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL_NOT_ARMABLE_PR1);
  });

  it('both flags ON is rejected at startup', () => {
    expect(() =>
      loadVehicleRegistrationConvergenceConfigFromEnv({
        ...baseEnv,
        [VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED_ENV]: 'true',
        [VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL_ENV]: 'true',
      }),
    ).toThrow(VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL_NOT_ARMABLE_PR1);
  });

  it('HM canonical flag ON alone is allowed (fail-closed stub at runtime)', () => {
    const config = loadVehicleRegistrationConvergenceConfigFromEnv({
      ...baseEnv,
      [VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED_ENV]: '1',
    });
    expect(config.hmOnlyCanonicalEnabled).toBe(true);
    expect(config.billingSingleRailEnabled).toBe(false);
  });

  it('rejects invalid boolean env values at load time', () => {
    expect(() =>
      loadVehicleRegistrationConvergenceConfigFromEnv({
        ...baseEnv,
        [VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED_ENV]: 'maybe',
      }),
    ).toThrow(/Invalid boolean/);
  });
});