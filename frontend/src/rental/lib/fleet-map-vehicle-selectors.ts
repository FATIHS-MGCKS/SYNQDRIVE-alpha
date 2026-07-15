import type { VehicleData } from '../data/vehicles';
import {
  VEHICLE_OPERATIONAL_STATUS,
  type VehicleBookingContext,
  type VehicleBookingReference,
  type VehicleOperationalState,
  type VehicleOperationalStatus,
} from './vehicle-operational-state';
import {
  selectActiveBooking,
  selectBookingContext,
  selectCanBeConsideredForRentalReadiness,
  selectFutureBookingCount,
  selectIsCurrentlyAvailable,
  selectIsCurrentlyRented,
  selectIsInPickupReservationWindow,
  selectIsStatusReliable,
  selectNextBooking,
  selectOperationalState,
  selectOperationalStatus,
  selectOperationalStatusLabel,
  selectOperationalStatusReason,
  selectReservedBooking,
  type VehicleOperationalReadModel,
} from './vehicle-operational-state/selectors';

/** Runtime dashboard key (lowercase) — distinct from canonical `VehicleOperationalStatus`. */
export type RuntimeOperationalStatusKey =
  | 'available'
  | 'reserved'
  | 'active_rented'
  | 'maintenance'
  | 'unavailable'
  | 'unknown';

export type { VehicleOperationalReadModel };

/** @deprecated Use `VehicleOperationalReadModel` from `vehicle-operational-state`. */
export type FleetVehicleOperationalReadModel = VehicleOperationalReadModel &
  Pick<
    VehicleData,
    | 'reservedBookingId'
    | 'reservedCustomerName'
    | 'reservedPickupAt'
    | 'reservedReturnAt'
    | 'reservedPickupStationName'
    | 'reservedIsOverdue'
    | 'activeBookingId'
    | 'activeCustomerName'
    | 'activeStartAt'
    | 'activeReturnAt'
    | 'activeReturnStationName'
    | 'activeKmIncluded'
    | 'activeKmDriven'
    | 'activeIsOverdue'
  >;

/** @deprecated Use `selectOperationalStatus`. */
export const selectFleetOperationalStatus = selectOperationalStatus;

/** @deprecated Use `selectOperationalState`. */
export const selectFleetOperationalState = selectOperationalState;

export function selectFleetRawVehicleStatus(
  vehicle: Pick<VehicleOperationalReadModel, 'rawVehicleStatus' | 'status'>,
): string {
  return vehicle.rawVehicleStatus ?? vehicle.status;
}

/** @deprecated Use `selectBookingContext`. */
export const selectFleetBookingContext = selectBookingContext;

/** @deprecated Use `selectActiveBooking`. */
export const selectFleetActiveBooking = selectActiveBooking;

/** @deprecated Use `selectReservedBooking`. */
export const selectFleetReservedBooking = selectReservedBooking;

/** @deprecated Use `selectNextBooking`. */
export const selectFleetNextBooking = selectNextBooking;

/** @deprecated Use `selectFutureBookingCount`. */
export const selectFleetFutureBookingCount = selectFutureBookingCount;

export function selectFleetActiveIsOverdue(vehicle: VehicleOperationalReadModel): boolean {
  return selectActiveBooking(vehicle)?.isOverdue ?? Boolean(vehicle.activeIsOverdue);
}

export function selectFleetReservedIsOverdue(vehicle: VehicleOperationalReadModel): boolean {
  return selectReservedBooking(vehicle)?.isOverdue ?? Boolean(vehicle.reservedIsOverdue);
}

/** Maps canonical enum to dashboard runtime lowercase key. */
export function mapCanonicalOperationalStatusToRuntime(
  status: VehicleOperationalStatus,
): RuntimeOperationalStatusKey {
  switch (status) {
    case VEHICLE_OPERATIONAL_STATUS.AVAILABLE:
      return 'available';
    case VEHICLE_OPERATIONAL_STATUS.RESERVED:
      return 'reserved';
    case VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED:
      return 'active_rented';
    case VEHICLE_OPERATIONAL_STATUS.MAINTENANCE:
      return 'maintenance';
    case VEHICLE_OPERATIONAL_STATUS.BLOCKED:
      return 'unavailable';
    default:
      return 'unknown';
  }
}

export function selectFleetRuntimeOperationalStatus(
  vehicle: Pick<VehicleOperationalReadModel, 'operationalState' | 'status'> &
    Partial<VehicleOperationalReadModel>,
): RuntimeOperationalStatusKey {
  return mapCanonicalOperationalStatusToRuntime(selectOperationalStatus(vehicle));
}

/** Legacy flat-field accessors — backed by canonical booking context projection. */
export function selectFleetReservedPickupAt(vehicle: VehicleOperationalReadModel): string | null {
  return selectReservedBooking(vehicle)?.pickupAt ?? vehicle.reservedPickupAt ?? null;
}

export function selectFleetReservedReturnAt(vehicle: VehicleOperationalReadModel): string | null {
  return selectReservedBooking(vehicle)?.returnAt ?? vehicle.reservedReturnAt ?? null;
}

export function selectFleetActiveStartAt(vehicle: VehicleOperationalReadModel): string | null {
  return selectActiveBooking(vehicle)?.pickupAt ?? vehicle.activeStartAt ?? null;
}

export function selectFleetActiveReturnAt(vehicle: VehicleOperationalReadModel): string | null {
  return selectActiveBooking(vehicle)?.returnAt ?? vehicle.activeReturnAt ?? null;
}

/** @deprecated Use `selectOperationalStatusReason`. */
export const selectFleetOperationalReason = selectOperationalStatusReason;

export function selectFleetOperationalSource(
  vehicle: Pick<VehicleOperationalReadModel, 'operationalState'>,
): string | null {
  return vehicle.operationalState?.source ?? null;
}

export function selectFleetDataQualityReasons(
  vehicle: Pick<VehicleOperationalReadModel, 'operationalState' | 'dataQualityReasons'>,
): string[] {
  return vehicle.operationalState?.dataQualityReasons ?? vehicle.dataQualityReasons ?? [];
}

/** @deprecated Use `selectIsStatusReliable`. */
export const selectFleetIsReliable = selectIsStatusReliable;

export {
  selectCanBeConsideredForRentalReadiness,
  selectIsCurrentlyAvailable,
  selectIsCurrentlyRented,
  selectIsInPickupReservationWindow,
  selectOperationalStatusLabel,
};
