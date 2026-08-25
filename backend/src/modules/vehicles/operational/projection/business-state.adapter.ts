/**
 * Maps authoritative fleet/business workflow inputs to P0.2 businessState.
 * Does not mutate persisted Vehicle.status.
 */
import { VehicleStatus } from '@prisma/client';
import type { FleetVehicleOperationalStateDto } from '../fleet-operational-state.util';
import { BusinessOperationalState } from './vehicle-operational-projection.types';

function isBusinessOverlayUnreliable(
  operationalState: FleetVehicleOperationalStateDto,
): boolean {
  return (
    operationalState.dataQualityState === 'UNAVAILABLE' ||
    !operationalState.isReliable ||
    operationalState.status === 'UNKNOWN'
  );
}

export function businessStateFromFleetContext(input: {
  vehicleStatus: VehicleStatus | string | null | undefined;
  operationalState: FleetVehicleOperationalStateDto;
}): BusinessOperationalState {
  const { vehicleStatus, operationalState } = input;

  // Persisted maintenance workflow states are authoritative even when booking overlay fails.
  if (vehicleStatus === VehicleStatus.IN_SERVICE) {
    return BusinessOperationalState.IN_SERVICE;
  }
  if (vehicleStatus === VehicleStatus.OUT_OF_SERVICE) {
    return BusinessOperationalState.OUT_OF_SERVICE;
  }

  if (isBusinessOverlayUnreliable(operationalState)) {
    return BusinessOperationalState.UNKNOWN;
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
