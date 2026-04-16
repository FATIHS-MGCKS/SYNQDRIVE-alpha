import {
  extractHmProviderVehicleReference,
  isUsableHmCommandVehicleReference,
} from './high-mobility-vehicle-reference.util';

describe('high-mobility vehicle reference helpers', () => {
  describe('isUsableHmCommandVehicleReference', () => {
    it('rejects missing references and VIN placeholders', () => {
      expect(isUsableHmCommandVehicleReference(null, 'WDD2050861F664088')).toBe(false);
      expect(isUsableHmCommandVehicleReference('WDD2050861F664088', 'WDD2050861F664088')).toBe(false);
    });

    it('accepts provider references different from the VIN', () => {
      expect(isUsableHmCommandVehicleReference('hm-vehicle-123', 'WDD2050861F664088')).toBe(true);
    });
  });

  describe('extractHmProviderVehicleReference', () => {
    it('extracts nested provider vehicle ids', () => {
      expect(extractHmProviderVehicleReference({
        data: {
          vehicleId: 'hm-vehicle-123',
        },
      }, 'WDD2050861F664088')).toBe('hm-vehicle-123');
    });

    it('ignores vehicle ids that only repeat the VIN', () => {
      expect(extractHmProviderVehicleReference({
        vehicleId: 'WDD2050861F664088',
      }, 'WDD2050861F664088')).toBeNull();
    });

    it('finds vehicle ids inside webhook-style arrays', () => {
      expect(extractHmProviderVehicleReference({
        vehicles: [
          { status: 'approved' },
          { vehicleId: 'provider-789' },
        ],
      }, 'WDD2050861F664088')).toBe('provider-789');
    });
  });
});
