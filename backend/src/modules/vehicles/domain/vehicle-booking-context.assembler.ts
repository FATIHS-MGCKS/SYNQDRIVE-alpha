import { resolveFutureOccupancy } from './vehicle-booking-context.future-occupancy';
import { isRelevantFutureOccupancyBooking } from './vehicle-booking-context.future-occupancy';
import { resolveReservationWindowBooking } from './vehicle-booking-context.reservation-window';
import { resolveActiveRentalForVehicle } from './vehicle-active-rental.policy';
import { toDomainBookingRef } from './vehicle-booking-ref.serializer';
import type {
  AssembleBookingContextMapParams,
  AssembleVehicleBookingContextParams,
  VehicleBookingQueryRow,
} from './vehicle-booking-context.types';
import { compareBookingsByPickupStable } from './vehicle-booking-context.types';
import type { BookingStatus } from '@prisma/client';
import type {
  DataQualityReasonCode,
  VehicleStateEngineBookingStateInput,
} from './vehicle-operational-state.engine.types';
import { EMPTY_BOOKING_STATE_INPUT } from './vehicle-operational-state.engine.types';

/** Non-terminal statuses considered for fleet operational booking context. */
export const OPERATIONAL_BOOKING_STATUSES: BookingStatus[] = [
  'PENDING',
  'CONFIRMED',
  'ACTIVE',
];

export { compareBookingsByPickupStable } from './vehicle-booking-context.types';

/**
 * Assembles normalized engine booking state for a single vehicle.
 */
export function assembleVehicleBookingContext(
  params: AssembleVehicleBookingContextParams,
): VehicleStateEngineBookingStateInput {
  const { vehicleId, organizationId, bookings, evaluationAt, organizationTimezone } =
    params;

  const vehicleBookings = bookings
    .filter((b) => b.vehicleId === vehicleId)
    .filter((b) => OPERATIONAL_BOOKING_STATUSES.includes(b.status));

  const activeRental = resolveActiveRentalForVehicle({
    vehicleId,
    organizationId,
    bookings: vehicleBookings,
  });

  const dataQualityReasons: DataQualityReasonCode[] = [
    ...activeRental.dataQualityReasons,
  ];

  const activeBooking = activeRental.activeRow
    ? toDomainBookingRef(activeRental.activeRow, 'active_rental', evaluationAt)
    : null;
  const activeId = activeBooking?.id ?? null;

  const bindingFutureRows = vehicleBookings
    .filter((b) => isRelevantFutureOccupancyBooking(b, evaluationAt))
    .filter((b) => b.id !== activeId)
    .sort(compareBookingsByPickupStable);

  const reservationResult = resolveReservationWindowBooking(bindingFutureRows, {
    evaluationAt,
    organizationTimezone,
  });

  if (reservationResult.dataQualityReasons.length > 0) {
    dataQualityReasons.push(...reservationResult.dataQualityReasons);
  }

  const reservationRow = reservationResult.booking;
  const reservationWindowBooking = reservationRow
    ? toDomainBookingRef(reservationRow, 'pickup_window', evaluationAt)
    : null;
  const reservationId = reservationWindowBooking?.id ?? null;

  const futureOccupancy = resolveFutureOccupancy(bindingFutureRows, {
    evaluationAt,
    excludeBookingIds: reservationId ? [reservationId] : [],
  });

  const nextBooking = futureOccupancy.nextRow
    ? toDomainBookingRef(futureOccupancy.nextRow, 'future', evaluationAt)
    : null;
  const futureBookings = futureOccupancy.furtherRows.map((row) =>
    toDomainBookingRef(row, 'future', evaluationAt),
  );

  return {
    activeBooking,
    reservationWindowBooking,
    nextBooking,
    futureBookingCount: futureOccupancy.futureBookingCount,
    futureBookings,
    dataQualityState:
      dataQualityReasons.length > 0 ? 'DEGRADED' : 'RELIABLE',
    dataQualityReasons,
  };
}

export function assembleBookingContextMap(
  params: AssembleBookingContextMapParams,
): Map<string, VehicleStateEngineBookingStateInput> {
  const { organizationId, vehicleIds, bookings, evaluationAt, organizationTimezone } =
    params;
  const map = new Map<string, VehicleStateEngineBookingStateInput>();

  const bookingsByVehicle = new Map<string, VehicleBookingQueryRow[]>();
  for (const row of bookings) {
    const list = bookingsByVehicle.get(row.vehicleId) ?? [];
    list.push(row);
    bookingsByVehicle.set(row.vehicleId, list);
  }

  for (const vehicleId of vehicleIds) {
    const vehicleBookings = bookingsByVehicle.get(vehicleId) ?? [];
    map.set(
      vehicleId,
      assembleVehicleBookingContext({
        vehicleId,
        organizationId,
        bookings: vehicleBookings,
        evaluationAt,
        organizationTimezone,
      }),
    );
  }

  return map;
}

export function unavailableBookingContextMap(
  vehicleIds: string[],
): Map<string, VehicleStateEngineBookingStateInput> {
  const map = new Map<string, VehicleStateEngineBookingStateInput>();
  for (const vehicleId of vehicleIds) {
    map.set(vehicleId, {
      ...EMPTY_BOOKING_STATE_INPUT,
      activeBooking: null,
      reservationWindowBooking: null,
      nextBooking: null,
      futureBookings: [],
      dataQualityState: 'UNAVAILABLE',
      dataQualityReasons: ['BOOKING_QUERY_FAILED'],
    });
  }
  return map;
}
