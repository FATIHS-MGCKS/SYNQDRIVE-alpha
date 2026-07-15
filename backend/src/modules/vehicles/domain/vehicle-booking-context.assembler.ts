import type { BookingStatus } from '@prisma/client';
import type {
  BookingPhase,
  DataQualityReasonCode,
  DomainBookingRef,
  VehicleStateEngineBookingStateInput,
} from './vehicle-operational-state.engine.types';
import { EMPTY_BOOKING_STATE_INPUT } from './vehicle-operational-state.engine.types';
import { resolveReservationWindowBooking } from './vehicle-booking-context.reservation-window';
import { resolveActiveRentalForVehicle } from './vehicle-active-rental.policy';
import type {
  AssembleBookingContextMapParams,
  AssembleVehicleBookingContextParams,
  VehicleBookingQueryRow,
} from './vehicle-booking-context.types';
import { compareBookingsByPickupStable } from './vehicle-booking-context.types';

/** Non-terminal statuses considered for fleet operational booking context. */
export const OPERATIONAL_BOOKING_STATUSES: BookingStatus[] = [
  'PENDING',
  'CONFIRMED',
  'ACTIVE',
];

export { compareBookingsByPickupStable } from './vehicle-booking-context.types';

function toDomainBookingRef(
  row: VehicleBookingQueryRow,
  phase: BookingPhase,
  evaluationAt: Date,
): DomainBookingRef {
  const isActivePhase = phase === 'active_rental';
  const pickupInstant =
    isActivePhase && row.handover.pickupPerformedAt
      ? row.handover.pickupPerformedAt
      : row.startDate;
  return {
    id: row.id,
    bookingNumber: '',
    status: row.status,
    pickupAt: pickupInstant.toISOString(),
    returnAt: row.endDate.toISOString(),
    customerLabel: row.customerLabel,
    vehicleId: row.vehicleId,
    phase,
    pickupStationName: row.pickupStationName,
    returnStationName: row.returnStationName,
    kmIncluded: row.kmIncluded,
    kmDriven: row.kmDriven,
    isOverdue: isActivePhase
      ? row.endDate.getTime() < evaluationAt.getTime()
      : row.startDate.getTime() < evaluationAt.getTime(),
  };
}

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

  const futureCandidates = vehicleBookings
    .filter(
      (b) =>
        (b.status === 'PENDING' || b.status === 'CONFIRMED') &&
        b.endDate.getTime() >= evaluationAt.getTime(),
    )
    .filter((b) => b.id !== activeId)
    .sort(compareBookingsByPickupStable);

  const reservationResult = resolveReservationWindowBooking(futureCandidates, {
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

  const futureQueue = futureCandidates.filter((b) => b.id !== reservationId);
  const nextRow = futureQueue[0] ?? null;
  const nextBooking = nextRow
    ? toDomainBookingRef(nextRow, 'future', evaluationAt)
    : null;
  const futureBookingCount = Math.max(
    0,
    futureQueue.length - (nextBooking ? 1 : 0),
  );

  return {
    activeBooking,
    reservationWindowBooking,
    nextBooking,
    futureBookingCount,
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
    const vehicleBookings = bookingsByVehicle.get(vehicleId);
    if (!vehicleBookings || vehicleBookings.length === 0) continue;
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
      dataQualityState: 'UNAVAILABLE',
      dataQualityReasons: ['BOOKING_QUERY_FAILED'],
    });
  }
  return map;
}
