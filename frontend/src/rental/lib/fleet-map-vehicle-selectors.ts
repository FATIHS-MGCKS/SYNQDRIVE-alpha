import type { FleetMapVehicleRow } from './fleet-map-vehicle-mapper';
import type {
  VehicleBookingContext,
  VehicleBookingReference,
  VehicleOperationalState,
  VehicleOperationalStatus,
} from './vehicle-operational-state';

type FleetVehicleReadModel = Pick<
  FleetMapVehicleRow,
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

/** Canonical operational status — never reads rawVehicleStatus. */
export function selectFleetOperationalStatus(
  vehicle: Pick<FleetVehicleReadModel, 'operationalState' | 'status'>,
): VehicleOperationalStatus {
  return vehicle.operationalState.status ?? vehicle.status;
}

export function selectFleetOperationalState(
  vehicle: Pick<FleetVehicleReadModel, 'operationalState'>,
): VehicleOperationalState {
  return vehicle.operationalState;
}

export function selectFleetRawVehicleStatus(
  vehicle: Pick<FleetVehicleReadModel, 'rawVehicleStatus'>,
): string {
  return vehicle.rawVehicleStatus;
}

export function selectFleetBookingContext(
  vehicle: Pick<FleetVehicleReadModel, 'bookingContext'>,
): VehicleBookingContext {
  return vehicle.bookingContext;
}

export function selectFleetActiveBooking(
  vehicle: Pick<FleetVehicleReadModel, 'bookingContext' | 'activeBookingId'>,
): VehicleBookingReference | null {
  return vehicle.bookingContext.activeBooking;
}

export function selectFleetReservedBooking(
  vehicle: Pick<FleetVehicleReadModel, 'bookingContext' | 'reservedBookingId'>,
): VehicleBookingReference | null {
  return vehicle.bookingContext.reservedBooking;
}

export function selectFleetNextBooking(
  vehicle: Pick<FleetVehicleReadModel, 'bookingContext'>,
): VehicleBookingReference | null {
  return vehicle.bookingContext.nextBooking;
}

export function selectFleetFutureBookingCount(
  vehicle: Pick<FleetVehicleReadModel, 'bookingContext'>,
): number {
  return vehicle.bookingContext.futureBookingCount;
}

/** Legacy flat-field accessors — backed by canonical booking context projection. */
export function selectFleetReservedPickupAt(
  vehicle: FleetVehicleReadModel,
): string | null {
  return vehicle.bookingContext.reservedBooking?.pickupAt ?? vehicle.reservedPickupAt ?? null;
}

export function selectFleetReservedReturnAt(
  vehicle: FleetVehicleReadModel,
): string | null {
  return vehicle.bookingContext.reservedBooking?.returnAt ?? vehicle.reservedReturnAt ?? null;
}

export function selectFleetActiveStartAt(vehicle: FleetVehicleReadModel): string | null {
  return vehicle.bookingContext.activeBooking?.pickupAt ?? vehicle.activeStartAt ?? null;
}

export function selectFleetActiveReturnAt(vehicle: FleetVehicleReadModel): string | null {
  return vehicle.bookingContext.activeBooking?.returnAt ?? vehicle.activeReturnAt ?? null;
}

export function selectFleetOperationalReason(
  vehicle: Pick<FleetVehicleReadModel, 'operationalState'>,
): string | null {
  return vehicle.operationalState.reason;
}

export function selectFleetOperationalSource(
  vehicle: Pick<FleetVehicleReadModel, 'operationalState'>,
): string | null {
  return vehicle.operationalState.source;
}

export function selectFleetDataQualityReasons(
  vehicle: Pick<FleetVehicleReadModel, 'operationalState' | 'dataQualityReasons'>,
): string[] {
  return vehicle.operationalState.dataQualityReasons ?? vehicle.dataQualityReasons ?? [];
}

export function selectFleetIsReliable(
  vehicle: Pick<FleetVehicleReadModel, 'operationalState' | 'isReliable'>,
): boolean {
  return vehicle.operationalState.isReliable ?? Boolean(vehicle.isReliable);
}
