import { BadRequestException } from '@nestjs/common';
import { requireExtractionVehicleId } from './document-extraction-vehicle.util';

describe('requireExtractionVehicleId', () => {
  it('returns vehicle id for vehicle-scoped extractions', () => {
    expect(requireExtractionVehicleId({ id: 'ext-1', vehicleId: 'veh-1' })).toBe('veh-1');
  });

  it('rejects org-only extractions on legacy vehicle paths', () => {
    expect(() => requireExtractionVehicleId({ id: 'ext-1', vehicleId: null })).toThrow(
      BadRequestException,
    );
  });
});
