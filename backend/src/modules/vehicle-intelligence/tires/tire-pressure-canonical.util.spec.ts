import {
  TIRE_PRESSURE_PROVIDER_DIMO,
  TIRE_PRESSURE_PROVIDER_HIGH_MOBILITY,
  TIRE_PRESSURE_UNIT_BAR,
  TIRE_PRESSURE_UNIT_KPA,
} from '@modules/dimo/dimo-tire-pressure.normalizer';
import {
  isLegacyDimoKpaStoredValue,
  resolveCanonicalTirePressureBar,
  resolveCanonicalVehicleTirePressuresBar,
} from './tire-pressure-canonical.util';

describe('tire-pressure-canonical.util', () => {
  describe('isLegacyDimoKpaStoredValue', () => {
    it('detects legacy DIMO kPa rows only with DIMO provider context', () => {
      expect(isLegacyDimoKpaStoredValue('DIMO', 274)).toBe(true);
      expect(isLegacyDimoKpaStoredValue('dimo', 301)).toBe(true);
    });

    it('does not treat HM values as legacy DIMO kPa even when magnitude is kPa-like', () => {
      expect(isLegacyDimoKpaStoredValue('HIGH_MOBILITY', 275)).toBe(false);
    });

    it('does not apply a global heuristic without provider context', () => {
      expect(isLegacyDimoKpaStoredValue(null, 275)).toBe(false);
      expect(isLegacyDimoKpaStoredValue(undefined, 275)).toBe(false);
    });

    it('does not flag post-fix bar magnitudes as legacy kPa', () => {
      expect(isLegacyDimoKpaStoredValue('DIMO', 2.74)).toBe(false);
    });
  });

  describe('resolveCanonicalTirePressureBar', () => {
    it('converts legacy DIMO stored kPa to bar on read', () => {
      const reading = resolveCanonicalTirePressureBar(274, 'DIMO');
      expect(reading.normalizedValue).toBe(2.74);
      expect(reading.sourceValue).toBe(274);
      expect(reading.sourceUnit).toBe(TIRE_PRESSURE_UNIT_KPA);
      expect(reading.sourceProvider).toBe(TIRE_PRESSURE_PROVIDER_DIMO);
      expect(reading.normalizedUnit).toBe(TIRE_PRESSURE_UNIT_BAR);
    });

    it('passes through post-fix DIMO bar without second conversion', () => {
      const reading = resolveCanonicalTirePressureBar(2.74, 'DIMO');
      expect(reading.normalizedValue).toBe(2.74);
      expect(reading.sourceValue).toBe(2.74);
      expect(reading.sourceUnit).toBe(TIRE_PRESSURE_UNIT_BAR);
    });

    it('passes HM bar values through unchanged', () => {
      const reading = resolveCanonicalTirePressureBar(2.75, 'HIGH_MOBILITY');
      expect(reading.normalizedValue).toBe(2.75);
      expect(reading.sourceProvider).toBe(TIRE_PRESSURE_PROVIDER_HIGH_MOBILITY);
      expect(reading.sourceUnit).toBe(TIRE_PRESSURE_UNIT_BAR);
    });

    it('rejects implausible HM values for wear factor consumption', () => {
      const reading = resolveCanonicalTirePressureBar(0, 'HIGH_MOBILITY');
      expect(reading.normalizedValue).toBeNull();
      expect(reading.plausibility).toBe('zero');
    });

    it('rejects missing values', () => {
      const reading = resolveCanonicalTirePressureBar(null, 'DIMO');
      expect(reading.normalizedValue).toBeNull();
      expect(reading.plausibility).toBe('missing');
    });
  });

  describe('resolveCanonicalVehicleTirePressuresBar', () => {
    it('resolves all four wheel positions for legacy DIMO vehicle', () => {
      const pressures = resolveCanonicalVehicleTirePressuresBar({
        providerSource: 'DIMO',
        tirePressureFl: 294,
        tirePressureFr: 301,
        tirePressureRl: 274,
        tirePressureRr: 289,
      });
      expect(pressures).toEqual({
        tirePressureFl: 2.94,
        tirePressureFr: 3.01,
        tirePressureRl: 2.74,
        tirePressureRr: 2.89,
      });
    });

    it('keeps HM and DIMO paths separate', () => {
      const hm = resolveCanonicalVehicleTirePressuresBar({
        providerSource: 'HIGH_MOBILITY',
        tirePressureFl: 2.75,
        tirePressureFr: 2.85,
        tirePressureRl: 2.77,
        tirePressureRr: 2.82,
      });
      expect(hm.tirePressureFl).toBe(2.75);

      const dimo = resolveCanonicalVehicleTirePressuresBar({
        providerSource: 'DIMO',
        tirePressureFl: 275,
      });
      expect(dimo.tirePressureFl).toBe(2.75);
    });
  });
});
