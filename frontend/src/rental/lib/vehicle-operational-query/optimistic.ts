import {
  normalizeFleetOperationalStatus,
  type FleetDataQualityState,
  type FleetStatusKey,
} from '../vehicle-status';
import type {
  FleetOperationalOptimisticPatch,
  VehicleOperationalBookingContext,
  VehicleOperationalOptimisticKind,
} from './types';

export interface OptimisticFleetVehicleSource {
  id: string;
  status: string;
  dataQualityState?: FleetDataQualityState | string | null;
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
  return normalizeFleetOperationalStatus({
    status: vehicle.status,
    dataQualityState: vehicle.dataQualityState,
    isReliable: vehicle.isReliable,
  }).isUnknown;
}

function canAssumeAvailableFrom(status: FleetStatusKey): boolean {
  return status === 'Active Rented' || status === 'Reserved';
}

/**
 * Pickup: show Active Rented immediately when the current read-model is reliable
 * and Reserved/Available. Never fabricate Available from Unknown.
 */
export function derivePickupOptimisticPatch(
  vehicle: OptimisticFleetVehicleSource,
  booking?: VehicleOperationalBookingContext,
): FleetOperationalOptimisticPatch | null {
  if (vehicleIsUnknown(vehicle)) return null;

  const status = normalizeFleetOperationalStatus({
    status: vehicle.status,
    dataQualityState: vehicle.dataQualityState,
    isReliable: vehicle.isReliable,
  }).status;

  if (status !== 'Reserved' && status !== 'Available') return null;

  return {
    status: 'Active Rented',
    reservedBookingId: null,
    reservedCustomerName: null,
    reservedPickupAt: null,
    reservedPickupStationName: null,
    reservedIsOverdue: false,
    activeBookingId: booking?.bookingId ?? vehicle.reservedBookingId ?? vehicle.activeBookingId,
    activeCustomerName: booking?.customerName ?? vehicle.reservedCustomerName ?? vehicle.activeCustomerName,
    activeReturnAt: booking?.returnAt ?? vehicle.activeReturnAt,
    activeReturnStationName: booking?.returnStationName ?? vehicle.activeReturnStationName,
    activeIsOverdue: false,
  };
}

/**
 * Return: derive Available only from a reliable Active Rented state.
 * Unknown → no optimistic Available (fail-closed).
 */
export function deriveReturnOptimisticPatch(
  vehicle: OptimisticFleetVehicleSource,
): FleetOperationalOptimisticPatch | null {
  if (vehicleIsUnknown(vehicle)) return null;

  const status = normalizeFleetOperationalStatus({
    status: vehicle.status,
    dataQualityState: vehicle.dataQualityState,
    isReliable: vehicle.isReliable,
  }).status;

  if (!canAssumeAvailableFrom(status)) return null;

  return {
    status: 'Available',
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

  const status = normalizeFleetOperationalStatus({
    status: vehicle.status,
    dataQualityState: vehicle.dataQualityState,
    isReliable: vehicle.isReliable,
  }).status;

  if (status !== 'Available') return null;

  return {
    status: 'Reserved',
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

  const status = normalizeFleetOperationalStatus({
    status: vehicle.status,
    dataQualityState: vehicle.dataQualityState,
    isReliable: vehicle.isReliable,
  }).status;

  if (status !== 'Reserved') return null;

  return {
    status: 'Available',
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
