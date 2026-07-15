import type { VehicleData } from '../data/vehicles';
import {
  VEHICLE_OPERATIONAL_STATUS,
  type VehicleBookingContext,
  type VehicleBookingReference,
  type VehicleOperationalState,
  type VehicleOperationalStatus,
} from './vehicle-operational-state';

/** Runtime dashboard key (lowercase) — distinct from canonical `VehicleOperationalStatus`. */
export type RuntimeOperationalStatusKey =
  | 'available'
  | 'reserved'
  | 'active_rented'
  | 'maintenance'
  | 'unavailable'
  | 'unknown';

export type VehicleOperationalReadModel = Pick<
  VehicleData,
  | 'status'
  | 'rawVehicleStatus'
  | 'operationalState'
  | 'bookingContext'
  | 'dataQualityState'
  | 'dataQualityReasons'
  | 'isReliable'
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

function legacyActiveBooking(vehicle: VehicleOperationalReadModel): VehicleBookingReference | null {
  if (!vehicle.activeBookingId) return null;
  return {
    bookingId: vehicle.activeBookingId,
    customerName: vehicle.activeCustomerName ?? null,
    pickupAt: vehicle.activeStartAt ?? null,
    returnAt: vehicle.activeReturnAt ?? null,
    pickupStationName: null,
    returnStationName: vehicle.activeReturnStationName ?? null,
    isOverdue: Boolean(vehicle.activeIsOverdue),
  };
}

function legacyReservedBooking(vehicle: VehicleOperationalReadModel): VehicleBookingReference | null {
  if (!vehicle.reservedBookingId) return null;
  return {
    bookingId: vehicle.reservedBookingId,
    customerName: vehicle.reservedCustomerName ?? null,
    pickupAt: vehicle.reservedPickupAt ?? null,
    returnAt: vehicle.reservedReturnAt ?? null,
    pickupStationName: vehicle.reservedPickupStationName ?? null,
    returnStationName: null,
    isOverdue: Boolean(vehicle.reservedIsOverdue),
  };
}

/** Canonical operational status — never reads rawVehicleStatus. */
export function selectFleetOperationalStatus(
  vehicle: Pick<VehicleOperationalReadModel, 'operationalState' | 'status'>,
): VehicleOperationalStatus {
  return vehicle.operationalState?.status ?? vehicle.status;
}

export function selectFleetOperationalState(
  vehicle: Pick<VehicleOperationalReadModel, 'operationalState' | 'status' | 'dataQualityState' | 'isReliable' | 'dataQualityReasons'>,
): VehicleOperationalState {
  if (vehicle.operationalState) return vehicle.operationalState;
  return {
    status: vehicle.status,
    reason: null,
    source: null,
    effectiveFrom: null,
    effectiveUntil: null,
    derivedAt: null,
    dataQualityState: vehicle.dataQualityState ?? null,
    dataQualityReasons: vehicle.dataQualityReasons ?? [],
    isReliable: vehicle.isReliable ?? true,
  };
}

export function selectFleetRawVehicleStatus(
  vehicle: Pick<VehicleOperationalReadModel, 'rawVehicleStatus' | 'status'>,
): string {
  return vehicle.rawVehicleStatus ?? vehicle.status;
}

export function selectFleetBookingContext(
  vehicle: VehicleOperationalReadModel,
): VehicleBookingContext {
  if (vehicle.bookingContext) return vehicle.bookingContext;
  return {
    activeBooking: legacyActiveBooking(vehicle),
    reservedBooking: legacyReservedBooking(vehicle),
    nextBooking: null,
    futureBookingCount: 0,
  };
}

export function selectFleetActiveBooking(
  vehicle: VehicleOperationalReadModel,
): VehicleBookingReference | null {
  return selectFleetBookingContext(vehicle).activeBooking;
}

export function selectFleetReservedBooking(
  vehicle: VehicleOperationalReadModel,
): VehicleBookingReference | null {
  return selectFleetBookingContext(vehicle).reservedBooking;
}

export function selectFleetNextBooking(
  vehicle: VehicleOperationalReadModel,
): VehicleBookingReference | null {
  return selectFleetBookingContext(vehicle).nextBooking;
}

export function selectFleetFutureBookingCount(vehicle: VehicleOperationalReadModel): number {
  return selectFleetBookingContext(vehicle).futureBookingCount;
}

export function selectFleetActiveIsOverdue(vehicle: VehicleOperationalReadModel): boolean {
  return selectFleetActiveBooking(vehicle)?.isOverdue ?? Boolean(vehicle.activeIsOverdue);
}

export function selectFleetReservedIsOverdue(vehicle: VehicleOperationalReadModel): boolean {
  return selectFleetReservedBooking(vehicle)?.isOverdue ?? Boolean(vehicle.reservedIsOverdue);
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
  vehicle: Pick<VehicleOperationalReadModel, 'operationalState' | 'status'>,
): RuntimeOperationalStatusKey {
  return mapCanonicalOperationalStatusToRuntime(selectFleetOperationalStatus(vehicle));
}

/** Legacy flat-field accessors — backed by canonical booking context projection. */
export function selectFleetReservedPickupAt(vehicle: VehicleOperationalReadModel): string | null {
  return selectFleetReservedBooking(vehicle)?.pickupAt ?? vehicle.reservedPickupAt ?? null;
}

export function selectFleetReservedReturnAt(vehicle: VehicleOperationalReadModel): string | null {
  return selectFleetReservedBooking(vehicle)?.returnAt ?? vehicle.reservedReturnAt ?? null;
}

export function selectFleetActiveStartAt(vehicle: VehicleOperationalReadModel): string | null {
  return selectFleetActiveBooking(vehicle)?.pickupAt ?? vehicle.activeStartAt ?? null;
}

export function selectFleetActiveReturnAt(vehicle: VehicleOperationalReadModel): string | null {
  return selectFleetActiveBooking(vehicle)?.returnAt ?? vehicle.activeReturnAt ?? null;
}

export function selectFleetOperationalReason(
  vehicle: Pick<VehicleOperationalReadModel, 'operationalState'>,
): string | null {
  return vehicle.operationalState?.reason ?? null;
}

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

export function selectFleetIsReliable(
  vehicle: Pick<VehicleOperationalReadModel, 'operationalState' | 'isReliable'>,
): boolean {
  return vehicle.operationalState?.isReliable ?? Boolean(vehicle.isReliable);
}
