import {
  flattenBookingContextToLegacy,
  mapFleetMapVehicleResponse,
  normalizeFleetMapApiResponse,
  type FleetMapVehicleRow,
} from '../lib/fleet-map-vehicle-mapper';
import type { FleetOperationalOptimisticPatch } from '../lib/vehicle-operational-query/types';
import {
  VEHICLE_OPERATIONAL_STATUS,
  type VehicleBookingContext,
  type VehicleOperationalState,
} from '../lib/vehicle-operational-state';

export type { FleetMapVehicleRow as FleetMapVehicle };

function patchBookingContext(
  current: VehicleBookingContext,
  patch: FleetOperationalOptimisticPatch,
): VehicleBookingContext {
  let activeBooking = current.activeBooking;
  let reservedBooking = current.reservedBooking;

  if (
    patch.activeBookingId !== undefined ||
    patch.activeCustomerName !== undefined ||
    patch.activeReturnAt !== undefined ||
    patch.activeReturnStationName !== undefined ||
    patch.activeIsOverdue !== undefined
  ) {
    if (patch.activeBookingId === null) {
      activeBooking = null;
    } else if (patch.activeBookingId || activeBooking) {
      activeBooking = {
        bookingId: patch.activeBookingId ?? activeBooking?.bookingId ?? '',
        customerName: patch.activeCustomerName ?? activeBooking?.customerName ?? null,
        pickupAt: activeBooking?.pickupAt ?? null,
        returnAt: patch.activeReturnAt ?? activeBooking?.returnAt ?? null,
        pickupStationName: activeBooking?.pickupStationName ?? null,
        returnStationName:
          patch.activeReturnStationName ?? activeBooking?.returnStationName ?? null,
        isOverdue: patch.activeIsOverdue ?? activeBooking?.isOverdue ?? false,
      };
      if (!activeBooking.bookingId) activeBooking = null;
    }
  }

  if (
    patch.reservedBookingId !== undefined ||
    patch.reservedCustomerName !== undefined ||
    patch.reservedPickupAt !== undefined ||
    patch.reservedPickupStationName !== undefined ||
    patch.reservedIsOverdue !== undefined
  ) {
    if (patch.reservedBookingId === null) {
      reservedBooking = null;
    } else if (patch.reservedBookingId || reservedBooking) {
      reservedBooking = {
        bookingId: patch.reservedBookingId ?? reservedBooking?.bookingId ?? '',
        customerName:
          patch.reservedCustomerName ?? reservedBooking?.customerName ?? null,
        pickupAt: patch.reservedPickupAt ?? reservedBooking?.pickupAt ?? null,
        returnAt: reservedBooking?.returnAt ?? null,
        pickupStationName:
          patch.reservedPickupStationName ?? reservedBooking?.pickupStationName ?? null,
        returnStationName: reservedBooking?.returnStationName ?? null,
        isOverdue: patch.reservedIsOverdue ?? reservedBooking?.isOverdue ?? false,
      };
      if (!reservedBooking.bookingId) reservedBooking = null;
    }
  }

  return {
    ...current,
    activeBooking,
    reservedBooking,
  };
}

function patchOperationalState(
  current: VehicleOperationalState,
  nextStatus: VehicleOperationalState['status'] | undefined,
): VehicleOperationalState {
  if (!nextStatus) return current;
  return {
    ...current,
    status: nextStatus,
    isReliable:
      nextStatus === VEHICLE_OPERATIONAL_STATUS.UNKNOWN ? false : current.isReliable,
  };
}

export function applyFleetOperationalOptimisticPatch(
  vehicle: FleetMapVehicleRow,
  patch: FleetOperationalOptimisticPatch,
): FleetMapVehicleRow {
  const bookingContext = patchBookingContext(vehicle.bookingContext, patch);
  const operationalState = patchOperationalState(vehicle.operationalState, patch.status);
  const legacyBooking = flattenBookingContextToLegacy(bookingContext, {
    activeKmIncluded: patch.activeKmIncluded ?? vehicle.activeKmIncluded ?? null,
    activeKmDriven: patch.activeKmDriven ?? vehicle.activeKmDriven ?? null,
  });

  return {
    ...vehicle,
    ...patch,
    ...legacyBooking,
    status: operationalState.status,
    operationalState,
    bookingContext,
    dataQualityState: operationalState.dataQualityState,
    dataQualityReasons: operationalState.dataQualityReasons,
    isReliable: operationalState.isReliable,
  };
}

export { mapFleetMapVehicleResponse, normalizeFleetMapApiResponse };
