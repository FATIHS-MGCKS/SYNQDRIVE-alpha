import { VehicleStatus } from '@prisma/client';
import { businessStateFromFleetContext } from './business-state.adapter';
import { BusinessOperationalState } from './vehicle-operational-projection.types';
import type { FleetVehicleOperationalStateDto } from '../fleet-operational-state.util';

function operationalDto(
  status: FleetVehicleOperationalStateDto['status'],
  overrides: Partial<FleetVehicleOperationalStateDto> = {},
): FleetVehicleOperationalStateDto {
  return {
    status,
    reason: null,
    source: 'test',
    derivedAt: '2026-08-25T12:00:00.000Z',
    dataQualityState: 'RELIABLE',
    dataQualityReasons: [],
    isReliable: true,
    ...overrides,
  };
}

describe('businessStateFromFleetContext', () => {
  it('maps AVAILABLE fleet token to AVAILABLE business state', () => {
    expect(
      businessStateFromFleetContext({
        vehicleStatus: VehicleStatus.AVAILABLE,
        operationalState: operationalDto('AVAILABLE'),
      }),
    ).toBe(BusinessOperationalState.AVAILABLE);
  });

  it('preserves IN_SERVICE vs OUT_OF_SERVICE from persisted status', () => {
    expect(
      businessStateFromFleetContext({
        vehicleStatus: VehicleStatus.IN_SERVICE,
        operationalState: operationalDto('MAINTENANCE'),
      }),
    ).toBe(BusinessOperationalState.IN_SERVICE);
    expect(
      businessStateFromFleetContext({
        vehicleStatus: VehicleStatus.OUT_OF_SERVICE,
        operationalState: operationalDto('MAINTENANCE'),
      }),
    ).toBe(BusinessOperationalState.OUT_OF_SERVICE);
  });

  it('maps booking-derived ACTIVE_RENTED to RENTED', () => {
    expect(
      businessStateFromFleetContext({
        vehicleStatus: VehicleStatus.AVAILABLE,
        operationalState: operationalDto('ACTIVE_RENTED'),
      }),
    ).toBe(BusinessOperationalState.RENTED);
  });
});
