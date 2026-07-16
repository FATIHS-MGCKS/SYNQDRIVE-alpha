import {
  VEHICLE_OPERATIONAL_STATUS,
  normalizeVehicleOperationalStatus,
  type VehicleDataQualityState,
  type VehicleOperationalStatus,
} from '../vehicle-operational-state';
import type {
  FleetOperationalOptimisticPatch,
  VehicleOperationalBookingContext,
  VehicleOperationalOptimisticKind,
} from './types';

export interface OptimisticFleetVehicleSource {
  id: string;
  status: string;
  dataQualityState?: VehicleDataQualityState | string | null;
  isReliable?: boolean | null;
  reservedBookingId?: string | null;
  reservedCustomerName?: string | null;
  reservedPickupAt?: string | null;
  reservedPickupStationName?: string | null;
  activeBookingId?: string | null;
  activeCustomerName?: string | null;
  activeReturnAt?: string | null;
  activeReturnStationName?: string | null;
}

function vehicleIsUnknown(vehicle: OptimisticFleetVehicleSource): boolean {
  return normalizeVehicleOperationalStatus({
    status: vehicle.status,
    dataQualityState: vehicle.dataQualityState,
    isReliable: vehicle.isReliable,
  }).isUnknown;
}

function canAssumeAvailableFrom(status: VehicleOperationalStatus): boolean {
  return (
    status === VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED ||
    status === VEHICLE_OPERATIONAL_STATUS.RESERVED
  );
}

/**
 * Pickup: show ACTIVE_RENTED immediately when the current read-model is reliable
 * and RESERVED/AVAILABLE. Never fabricate AVAILABLE from UNKNOWN.
 */
export function derivePickupOptimisticPatch(
  vehicle: OptimisticFleetVehicleSource,
  booking?: VehicleOperationalBookingContext,
): FleetOperationalOptimisticPatch | null {
  if (vehicleIsUnknown(vehicle)) return null;

  const status = normalizeVehicleOperationalStatus({
    status: vehicle.status,
    dataQualityState: vehicle.dataQualityState,
    isReliable: vehicle.isReliable,
  }).status;

  if (
    status !== VEHICLE_OPERATIONAL_STATUS.RESERVED &&
    status !== VEHICLE_OPERATIONAL_STATUS.AVAILABLE
  ) {
    return null;
  }

  return {
    status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
    reservedBookingId: null,
    reservedCustomerName: null,
    reservedPickupAt: null,
    reservedPickupStationName: null,
    reservedIsOverdue: false,
    activeBookingId: booking?.bookingId ?? vehicle.reservedBookingId ?? vehicle.activeBookingId,
    activeCustomerName:
      booking?.customerName ?? vehicle.reservedCustomerName ?? vehicle.activeCustomerName,
    activeReturnAt: booking?.returnAt ?? vehicle.activeReturnAt,
    activeReturnStationName: booking?.returnStationName ?? vehicle.activeReturnStationName,
    activeIsOverdue: false,
  };
}

/**
 * Return: derive AVAILABLE only from a reliable ACTIVE_RENTED state.
 * UNKNOWN → no optimistic AVAILABLE (fail-closed).
 */
export function deriveReturnOptimisticPatch(
  vehicle: OptimisticFleetVehicleSource,
): FleetOperationalOptimisticPatch | null {
  if (vehicleIsUnknown(vehicle)) return null;

  const status = normalizeVehicleOperationalStatus({
    status: vehicle.status,
    dataQualityState: vehicle.dataQualityState,
    isReliable: vehicle.isReliable,
  }).status;

  if (!canAssumeAvailableFrom(status)) return null;

  return {
    status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
    activeBookingId: null,
    activeCustomerName: null,
    activeReturnAt: null,
    activeReturnStationName: null,
    activeIsOverdue: false,
    activeKmIncluded: null,
    activeKmDriven: null,
  } as FleetOperationalOptimisticPatch;
}

export function deriveReserveOptimisticPatch(
  vehicle: OptimisticFleetVehicleSource,
  booking?: VehicleOperationalBookingContext,
): FleetOperationalOptimisticPatch | null {
  if (vehicleIsUnknown(vehicle)) return null;

  const status = normalizeVehicleOperationalStatus({
    status: vehicle.status,
    dataQualityState: vehicle.dataQualityState,
    isReliable: vehicle.isReliable,
  }).status;

  if (status !== VEHICLE_OPERATIONAL_STATUS.AVAILABLE) return null;

  return {
    status: VEHICLE_OPERATIONAL_STATUS.RESERVED,
    reservedBookingId: booking?.bookingId ?? null,
    reservedCustomerName: booking?.customerName ?? null,
    reservedPickupAt: booking?.pickupAt ?? null,
    reservedPickupStationName: booking?.pickupStationName ?? null,
    reservedIsOverdue: false,
  };
}

export function deriveReleaseOptimisticPatch(
  vehicle: OptimisticFleetVehicleSource,
): FleetOperationalOptimisticPatch | null {
  if (vehicleIsUnknown(vehicle)) return null;

  const status = normalizeVehicleOperationalStatus({
    status: vehicle.status,
    dataQualityState: vehicle.dataQualityState,
    isReliable: vehicle.isReliable,
  }).status;

  if (status !== VEHICLE_OPERATIONAL_STATUS.RESERVED) return null;

  return {
    status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
    reservedBookingId: null,
    reservedCustomerName: null,
    reservedPickupAt: null,
    reservedPickupStationName: null,
    reservedIsOverdue: false,
  };
}

export function deriveOptimisticPatches(
  vehicles: OptimisticFleetVehicleSource[],
  vehicleIds: string[],
  kind: VehicleOperationalOptimisticKind,
  booking?: VehicleOperationalBookingContext,
): Array<{ vehicleId: string; patch: FleetOperationalOptimisticPatch }> {
  if (kind === 'none') return [];

  const idSet = new Set(vehicleIds);
  const patches: Array<{ vehicleId: string; patch: FleetOperationalOptimisticPatch }> = [];

  for (const vehicle of vehicles) {
    if (!idSet.has(vehicle.id)) continue;

    let patch: FleetOperationalOptimisticPatch | null = null;
    switch (kind) {
      case 'pickup':
        patch = derivePickupOptimisticPatch(vehicle, booking);
        break;
      case 'return':
        patch = deriveReturnOptimisticPatch(vehicle);
        break;
      case 'reserve':
        patch = deriveReserveOptimisticPatch(vehicle, booking);
        break;
      case 'release':
        patch = deriveReleaseOptimisticPatch(vehicle);
        break;
      default:
        patch = null;
    }

    if (patch) {
      patches.push({ vehicleId: vehicle.id, patch });
    }
  }

  return patches;
}
