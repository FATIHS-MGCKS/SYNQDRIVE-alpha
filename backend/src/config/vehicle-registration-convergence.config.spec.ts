import {
  loadVehicleRegistrationConvergenceConfigFromEnv,
  validateVehicleRegistrationConvergenceConfig,
  VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL_ENV,
  VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED_ENV,
} from './vehicle-registration-convergence.config';

describe('vehicleRegistrationConvergenceConfig (V2B-PR1)', () => {
  const baseEnv = {
    ...process.env,
    [VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED_ENV]: '',
    [VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL_ENV]: '',
  };

  it('defaults both flags to false when unset', () => {
    const config = loadVehicleRegistrationConvergenceConfigFromEnv(baseEnv);
    expect(config.hmOnlyCanonicalEnabled).toBe(false);
    expect(config.billingSingleRailEnabled).toBe(false);
  });

  it('fail-closed: billing single rail without HM canonical throws', () => {
    expect(() =>
      validateVehicleRegistrationConvergenceConfig({
        hmOnlyCanonicalEnabled: false,
        billingSingleRailEnabled: true,
      }),
    ).toThrow(/BILLING_SINGLE_RAIL requires/);
  });

  it('rejects invalid boolean env values at load time', () => {
    expect(() =>
      loadVehicleRegistrationConvergenceConfigFromEnv({
        ...baseEnv,
        [VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED_ENV]: 'maybe',
      }),
    ).toThrow(/Invalid boolean/);
  });

  it('allows billing single rail when HM canonical is enabled', () => {
    const config = loadVehicleRegistrationConvergenceConfigFromEnv({
      ...baseEnv,
      [VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED_ENV]: 'true',
      [VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL_ENV]: '1',
    });
    expect(config.hmOnlyCanonicalEnabled).toBe(true);
    expect(config.billingSingleRailEnabled).toBe(true);
  });
});