import {
  getDtcStandardType,
  getDtcSystemCategory,
  isValidDtcCode,
  normalizeDtcCode,
} from './dtc-knowledge.util';

describe('dtc-knowledge.util', () => {
  describe('normalizeDtcCode', () => {
    it('trims, uppercases and removes internal whitespace', () => {
      expect(normalizeDtcCode('  p 0675 ')).toBe('P0675');
      expect(normalizeDtcCode('p0675')).toBe('P0675');
      expect(normalizeDtcCode('U0100')).toBe('U0100');
      expect(normalizeDtcCode('b 1 2 3 4')).toBe('B1234');
    });

    it('returns null for invalid patterns', () => {
      expect(normalizeDtcCode('X0675')).toBeNull(); // bad first char
      expect(normalizeDtcCode('P067')).toBeNull(); // too short
      expect(normalizeDtcCode('P06755')).toBeNull(); // too long
      expect(normalizeDtcCode('')).toBeNull();
      expect(normalizeDtcCode(null)).toBeNull();
      expect(normalizeDtcCode(undefined)).toBeNull();
      expect(normalizeDtcCode(123 as unknown as string)).toBeNull();
    });

    it('isValidDtcCode mirrors normalize', () => {
      expect(isValidDtcCode('p 0675')).toBe(true);
      expect(isValidDtcCode('nope')).toBe(false);
    });
  });

  describe('getDtcSystemCategory', () => {
    it('maps the first character to a system', () => {
      expect(getDtcSystemCategory('P0675')).toBe('POWERTRAIN');
      expect(getDtcSystemCategory('B1234')).toBe('BODY');
      expect(getDtcSystemCategory('C0040')).toBe('CHASSIS');
      expect(getDtcSystemCategory('U0100')).toBe('NETWORK');
      expect(getDtcSystemCategory('Z9999')).toBe('UNKNOWN');
    });
  });

  describe('getDtcStandardType', () => {
    it('classifies generic vs manufacturer-specific (best effort)', () => {
      expect(getDtcStandardType('P0675')).toBe('GENERIC');
      expect(getDtcStandardType('P1234')).toBe('MANUFACTURER_SPECIFIC');
      expect(getDtcStandardType('U0100')).toBe('GENERIC');
      expect(getDtcStandardType('C1040')).toBe('MANUFACTURER_SPECIFIC');
      expect(getDtcStandardType('P2096')).toBe('UNKNOWN');
      expect(getDtcStandardType('P3000')).toBe('UNKNOWN');
    });
  });
});
