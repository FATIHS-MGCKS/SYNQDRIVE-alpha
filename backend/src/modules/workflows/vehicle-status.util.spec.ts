import { normalizeVehicleStatus, normalizeVehicleStatusInput } from './vehicle-status.util';

describe('vehicle-status.util', () => {
  it('maps legacy maintenance labels to IN_SERVICE', () => {
    expect(normalizeVehicleStatusInput('Maintenance')).toBe('IN_SERVICE');
    expect(normalizeVehicleStatusInput('In Maintenance')).toBe('IN_SERVICE');
    expect(normalizeVehicleStatus('maintenance')).toBe('IN_SERVICE');
  });

  it('passes through canonical VehicleStatus values', () => {
    expect(normalizeVehicleStatusInput('AVAILABLE')).toBe('AVAILABLE');
    expect(normalizeVehicleStatusInput('RENTED')).toBe('RENTED');
    expect(normalizeVehicleStatusInput('OUT_OF_SERVICE')).toBe('OUT_OF_SERVICE');
    expect(normalizeVehicleStatusInput('RESERVED')).toBe('RESERVED');
  });
});
