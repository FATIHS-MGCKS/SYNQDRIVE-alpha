import {
  canCreateFallbackVehicleEnergyEvent,
  canRawRefuelFallbackAuthorizeVehicleEnergyEventPromotion,
  isRfrfNativeFallbackConvergenceAuthorized,
  isRawFuelRefuelFallbackMasterEnabled,
  isRawFuelRefuelFallbackPersistEnabled,
} from './raw-fuel-refuel-fallback.config';

describe('raw-fuel-refuel-fallback.config F4-PR3 F5 gate stub', () => {
  const baseEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...baseEnv };
  });

  it('F5 convergence gate defaults false', () => {
    expect(isRfrfNativeFallbackConvergenceAuthorized()).toBe(false);
    expect(canCreateFallbackVehicleEnergyEvent()).toBe(false);
  });

  it('master + persist flags cannot authorize VEE promotion or F5 convergence', () => {
    process.env.RAW_FUEL_REFUEL_FALLBACK_ENABLED = 'true';
    process.env.RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED = 'true';
    process.env.RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED = 'true';

    expect(isRawFuelRefuelFallbackMasterEnabled()).toBe(true);
    expect(isRawFuelRefuelFallbackPersistEnabled()).toBe(true);
    expect(isRfrfNativeFallbackConvergenceAuthorized()).toBe(false);
    expect(canCreateFallbackVehicleEnergyEvent()).toBe(false);
    expect(canRawRefuelFallbackAuthorizeVehicleEnergyEventPromotion()).toBe(false);
  });
});
