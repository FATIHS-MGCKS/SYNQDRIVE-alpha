/**
 * Maps authoritative fleet/business workflow inputs to P0.2 businessState.
 * Does not mutate persisted Vehicle.status.
 */
import { VehicleStatus } from '@prisma/client';
import type { FleetVehicleOperationalStateDto } from '../fleet-operational-state.util';
import { BusinessOperationalState } from './vehicle-operational-projection.types';

export function businessStateFromFleetContext(input: {
  vehicleStatus: VehicleStatus | string | null | undefined;
  operationalState: FleetVehicleOperationalStateDto;
}): BusinessOperationalState {
  const { vehicleStatus, operationalState } = input;

  if (
    operationalState.dataQualityState === 'UNAVAILABLE' ||
    operationalState.status === 'UNKNOWN'
  ) {
    return BusinessOperationalState.UNKNOWN;
  }

  if (vehicleStatus === VehicleStatus.IN_SERVICE) {
    return BusinessOperationalState.IN_SERVICE;
  }
  if (vehicleStatus === VehicleStatus.OUT_OF_SERVICE) {
    return BusinessOperationalState.OUT_OF_SERVICE;
  }

  switch (operationalState.status) {
    case 'ACTIVE_RENTED':
      return BusinessOperationalState.RENTED;
    case 'RESERVED':
      return BusinessOperationalState.RESERVED;
    case 'MAINTENANCE':
      return BusinessOperationalState.IN_SERVICE;
    case 'AVAILABLE':
      return BusinessOperationalState.AVAILABLE;
    default:
      return BusinessOperationalState.UNKNOWN;
  }
}
