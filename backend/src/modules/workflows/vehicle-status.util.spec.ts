import {
  normalizeVehicleStatus,
  normalizeVehicleStatusForPrisma,
  normalizeVehicleStatusInput,
} from './vehicle-status.util';

describe('vehicle-status.util', () => {
  it('maps legacy maintenance labels to IN_SERVICE', () => {
    expect(normalizeVehicleStatusInput('Maintenance')).toBe('IN_SERVICE');
    expect(normalizeVehicleStatusInput('In Maintenance')).toBe('IN_SERVICE');
    expect(normalizeVehicleStatusInput('In Wartung')).toBe('IN_SERVICE');
    expect(normalizeVehicleStatus('maintenance')).toBe('IN_SERVICE');
  });

  it('maps rented / out-of-service / reserved UI + German labels', () => {
    expect(normalizeVehicleStatusInput('Active Rented')).toBe('RENTED');
    expect(normalizeVehicleStatusInput('active_rented')).toBe('RENTED');
    expect(normalizeVehicleStatusInput('Out of Service')).toBe('OUT_OF_SERVICE');
    expect(normalizeVehicleStatusInput('Unavailable')).toBe('OUT_OF_SERVICE');
    expect(normalizeVehicleStatusInput('Nicht verfügbar')).toBe('OUT_OF_SERVICE');
    expect(normalizeVehicleStatusInput('Reserviert')).toBe('RESERVED');
  });

  it('passes through canonical VehicleStatus values', () => {
    expect(normalizeVehicleStatusInput('AVAILABLE')).toBe('AVAILABLE');
    expect(normalizeVehicleStatusInput('RENTED')).toBe('RENTED');
    expect(normalizeVehicleStatusInput('OUT_OF_SERVICE')).toBe('OUT_OF_SERVICE');
    expect(normalizeVehicleStatusInput('RESERVED')).toBe('RESERVED');
  });

  it('throws a controlled error on invalid / non-string input', () => {
    expect(() => normalizeVehicleStatus('totally-bogus')).toThrow();
    expect(() => normalizeVehicleStatusForPrisma(undefined)).toThrow();
    expect(() => normalizeVehicleStatusForPrisma(42)).toThrow();
    expect(() => normalizeVehicleStatusForPrisma('In Maintenance!!')).toThrow();
  });

  it('normalizeVehicleStatusForPrisma accepts UI labels', () => {
    expect(normalizeVehicleStatusForPrisma('Maintenance')).toBe('IN_SERVICE');
    expect(normalizeVehicleStatusForPrisma('Active Rented')).toBe('RENTED');
  });
});
