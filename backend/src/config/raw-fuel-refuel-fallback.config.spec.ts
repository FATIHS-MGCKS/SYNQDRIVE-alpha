import {
  RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV,
  RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV,
  RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV,
  RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV,
  canCreateFallbackVehicleEnergyEvent,
  canRawRefuelFallbackAuthorizeVehicleEnergyEventPromotion,
  isRawFuelRefuelFallbackMasterEnabled,
  isRawFuelRefuelFallbackPersistEnabled,
  isRfrfNativeFallbackConvergenceAuthorized,
  loadRawFuelRefuelFallbackConfig,
  parseRawFuelRefuelFallbackBoolean,
  parseRfrfNativeFallbackConvergenceAuthorized,
} from './raw-fuel-refuel-fallback.config';

describe('raw-fuel-refuel-fallback.config', () => {
  const baseEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...baseEnv };
  });

  it('missing master flag => false', () => {
    delete process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV];
    expect(isRawFuelRefuelFallbackMasterEnabled()).toBe(false);
  });

  it('false master flag => false', () => {
    process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV] = 'false';
    expect(isRawFuelRefuelFallbackMasterEnabled()).toBe(false);
  });

  it('true master flag => true for canonical syntax', () => {
    for (const value of ['true', '1', 'yes', 'on']) {
      process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV] = value;
      expect(isRawFuelRefuelFallbackMasterEnabled()).toBe(true);
    }
  });

  it('malformed master flag => fail closed (false)', () => {
    process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV] = 'maybe';
    expect(parseRawFuelRefuelFallbackBoolean(process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV])).toBe(
      false,
    );
    expect(isRawFuelRefuelFallbackMasterEnabled()).toBe(false);
  });

  it('persist flag is independent of master flag', () => {
    process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV] = 'false';
    process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV] = 'true';
    expect(isRawFuelRefuelFallbackMasterEnabled()).toBe(false);
    expect(isRawFuelRefuelFallbackPersistEnabled()).toBe(true);
  });

  it('persist flag cannot authorize VehicleEnergyEvent promotion', () => {
    process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV] = 'true';
    expect(canRawRefuelFallbackAuthorizeVehicleEnergyEventPromotion()).toBe(false);
  });

  it('cutover parses valid ISO and rejects malformed', () => {
    process.env[RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV] = '2026-09-13T00:00:00.000Z';
    const cfg = loadRawFuelRefuelFallbackConfig();
    expect(cfg.cutoverAt?.toISOString()).toBe('2026-09-13T00:00:00.000Z');

    process.env[RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV] = 'not-a-date';
    expect(loadRawFuelRefuelFallbackConfig().cutoverAt).toBeNull();
  });

  it('defaults remain false when env is empty', () => {
    delete process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV];
    delete process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV];
    const cfg = loadRawFuelRefuelFallbackConfig({});
    expect(cfg.masterEnabled).toBe(false);
    expect(cfg.persistEnabled).toBe(false);
  });

  it('F5 convergence authority defaults false and does not authorize VEE', () => {
    delete process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV];
    expect(isRfrfNativeFallbackConvergenceAuthorized()).toBe(false);
    process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV] = 'true';
    expect(isRfrfNativeFallbackConvergenceAuthorized()).toBe(true);
    process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV] = ' TRUE ';
    expect(isRfrfNativeFallbackConvergenceAuthorized()).toBe(true);
    expect(canCreateFallbackVehicleEnergyEvent()).toBe(false);
  });

  it('F5 convergence authority rejects non-canonical truthy values', () => {
    for (const value of ['1', 'yes', 'on', 'enabled', '0', 'false', '']) {
      process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV] = value;
      expect(isRfrfNativeFallbackConvergenceAuthorized()).toBe(false);
    }
    expect(parseRfrfNativeFallbackConvergenceAuthorized('1')).toBe(false);
    expect(parseRfrfNativeFallbackConvergenceAuthorized('yes')).toBe(false);
    expect(parseRfrfNativeFallbackConvergenceAuthorized('on')).toBe(false);
    expect(parseRfrfNativeFallbackConvergenceAuthorized('true')).toBe(true);
  });

  it('malformed F5 convergence authority => fail closed', () => {
    process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV] = 'maybe';
    expect(isRfrfNativeFallbackConvergenceAuthorized()).toBe(false);
  });
});
