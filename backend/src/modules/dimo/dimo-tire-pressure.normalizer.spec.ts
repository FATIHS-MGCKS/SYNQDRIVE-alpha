import {
  assessTirePressurePlausibility,
  DIMO_TIRE_PRESSURE_SIGNALS,
  kPaToBar,
  normalizeDimoSnapshotTirePressures,
  normalizeDimoTirePressureKpa,
  normalizeDimoTirePressureSignalField,
  TIRE_PRESSURE_PROVIDER_DIMO,
  TIRE_PRESSURE_UNIT_BAR,
  TIRE_PRESSURE_UNIT_KPA,
  toSynqDriveTirePressureMeta,
} from './dimo-tire-pressure.normalizer';

describe('dimo-tire-pressure.normalizer', () => {
  describe('normalizeDimoTirePressureKpa', () => {
    it('converts 274 kPa to 2.74 bar', () => {
      const reading = normalizeDimoTirePressureKpa(274);
      expect(reading.normalizedValue).toBe(2.74);
      expect(reading.normalizedUnit).toBe(TIRE_PRESSURE_UNIT_BAR);
      expect(reading.sourceValue).toBe(274);
      expect(reading.sourceUnit).toBe(TIRE_PRESSURE_UNIT_KPA);
      expect(reading.sourceProvider).toBe(TIRE_PRESSURE_PROVIDER_DIMO);
      expect(reading.plausibility).toBe('valid');
    });

    it('converts 301 kPa to 3.01 bar', () => {
      const reading = normalizeDimoTirePressureKpa(301);
      expect(reading.normalizedValue).toBe(3.01);
    });

    it('handles missing value', () => {
      const reading = normalizeDimoTirePressureKpa(null);
      expect(reading.normalizedValue).toBeNull();
      expect(reading.sourceValue).toBeNull();
      expect(reading.plausibility).toBe('missing');
    });

    it('rejects zero', () => {
      const reading = normalizeDimoTirePressureKpa(0);
      expect(reading.normalizedValue).toBeNull();
      expect(reading.plausibility).toBe('zero');
      expect(reading.sourceValue).toBe(0);
    });

    it('rejects negative values', () => {
      const reading = normalizeDimoTirePressureKpa(-12);
      expect(reading.normalizedValue).toBeNull();
      expect(reading.plausibility).toBe('negative');
    });

    it('rejects unrealistically high kPa values', () => {
      const reading = normalizeDimoTirePressureKpa(750);
      expect(reading.normalizedValue).toBeNull();
      expect(reading.plausibility).toBe('too_high');
    });

    it('rejects unrealistically low kPa values', () => {
      const reading = normalizeDimoTirePressureKpa(30);
      expect(reading.normalizedValue).toBeNull();
      expect(reading.plausibility).toBe('too_low');
    });

    it('preserves sourceTimestamp', () => {
      const ts = new Date('2026-07-16T12:00:00.000Z');
      const reading = normalizeDimoTirePressureKpa(274, ts);
      expect(reading.sourceTimestamp).toEqual(ts);
    });
  });

  describe('normalizeDimoTirePressureSignalField', () => {
    it('reads GraphQL SignalFloat shape with metadata', () => {
      const reading = normalizeDimoTirePressureSignalField({
        value: 289,
        timestamp: '2026-07-16T12:58:13.237Z',
      });
      expect(reading.normalizedValue).toBe(2.89);
      expect(reading.sourceTimestamp?.toISOString()).toBe(
        '2026-07-16T12:58:13.237Z',
      );
    });
  });

  describe('normalizeDimoSnapshotTirePressures', () => {
    it('normalizes all four wheel positions from signalsLatest', () => {
      const signals = {
        [DIMO_TIRE_PRESSURE_SIGNALS.fl]: { value: 294, timestamp: 1 },
        [DIMO_TIRE_PRESSURE_SIGNALS.fr]: { value: 301, timestamp: 1 },
        [DIMO_TIRE_PRESSURE_SIGNALS.rl]: { value: 274, timestamp: 1 },
        [DIMO_TIRE_PRESSURE_SIGNALS.rr]: { value: 289, timestamp: 1 },
      };

      const result = normalizeDimoSnapshotTirePressures(signals);
      expect(result.fl.normalizedValue).toBe(2.94);
      expect(result.fr.normalizedValue).toBe(3.01);
      expect(result.rl.normalizedValue).toBe(2.74);
      expect(result.rr.normalizedValue).toBe(2.89);
    });

    it('does not double-convert already-normalized bar magnitudes on re-ingest', () => {
      const barEquivalentKpa = 274;
      const once = normalizeDimoTirePressureKpa(barEquivalentKpa).normalizedValue;
      expect(once).toBe(2.74);
      expect(once).not.toBe(kPaToBar(2.74));
    });
  });

  describe('toSynqDriveTirePressureMeta', () => {
    it('serializes source metadata for raw payload provenance', () => {
      const reading = normalizeDimoTirePressureKpa(
        274,
        new Date('2026-07-16T12:00:00.000Z'),
      );
      expect(toSynqDriveTirePressureMeta(reading)).toEqual({
        normalizedValue: 2.74,
        normalizedUnit: TIRE_PRESSURE_UNIT_BAR,
        sourceValue: 274,
        sourceUnit: TIRE_PRESSURE_UNIT_KPA,
        sourceProvider: TIRE_PRESSURE_PROVIDER_DIMO,
        sourceTimestamp: '2026-07-16T12:00:00.000Z',
        plausibility: 'valid',
      });
    });
  });

  describe('assessTirePressurePlausibility', () => {
    it('classifies canonical bar band', () => {
      expect(assessTirePressurePlausibility(2.5)).toBe('valid');
      expect(assessTirePressurePlausibility(0.4)).toBe('too_low');
      expect(assessTirePressurePlausibility(6.5)).toBe('too_high');
    });
  });
});
