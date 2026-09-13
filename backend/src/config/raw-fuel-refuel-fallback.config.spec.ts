import {
  RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV,
  RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV,
  RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV,
  canRawRefuelFallbackAuthorizeVehicleEnergyEventPromotion,
  isRawFuelRefuelFallbackMasterEnabled,
  isRawFuelRefuelFallbackPersistEnabled,
  loadRawFuelRefuelFallbackConfig,
  parseRawFuelRefuelFallbackBoolean,
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
});
