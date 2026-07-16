import type { BookingStatus, HandoverKind, VehicleStatus } from '@prisma/client';
import type { FleetVehicleBookingContextDto } from '../vehicles.service';
import {
  isCanonicalPickupReservationDay,
  isLegacyReservationWindowBooking,
  resolveOrgTimezone,
  wouldCanonicalLogicReserveBooking,
} from '../operational/fleet-booking-context.util';

export {
  isCanonicalPickupReservationDay,
  isLegacyReservationWindowBooking,
  resolveOrgTimezone,
  wouldCanonicalLogicReserveBooking,
};

export const DEFAULT_DIAGNOSTIC_SAMPLE_LIMIT = 25;

export type DiagnosticBookingRow = {
  id: string;
  organizationId: string;
  vehicleId: string;
  status: BookingStatus;
  startDate: Date;
  endDate: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
};

export type DiagnosticHandoverRow = {
  id: string;
  organizationId: string;
  bookingId: string;
  vehicleId: string;
  kind: HandoverKind;
  performedAt: Date;
};

export type DiagnosticVehicleRow = {
  id: string;
  organizationId: string;
  licensePlate: string | null;
  status: VehicleStatus;
  tankCapacityLiters: number | null;
};

const RESERVATION_BOOKING_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED'];

export function isValidIanaTimezone(timezone: string): boolean {
  const tz = timezone.trim();
  if (!tz) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Diagnostic-only legacy mirror — production uses `fleet-booking-context.util`. */
export function buildDiagnosticBookingContext(
  bookings: DiagnosticBookingRow[],
  now: Date,
): FleetVehicleBookingContextDto {
  const empty = (): FleetVehicleBookingContextDto => ({
    reservedBookingId: null,
    reservedCustomerName: null,
    reservedPickupAt: null,
    reservedReturnAt: null,
    reservedPickupStationName: null,
    reservedIsOverdue: false,
    activeBookingId: null,
    activeCustomerName: null,
    activeStartAt: null,
    activeReturnAt: null,
    activeReturnStationName: null,
    activeKmIncluded: null,
    activeKmDriven: null,
    activeIsOverdue: false,
  });

  const relevant = bookings
    .filter(
      (b) =>
        b.status === 'ACTIVE' ||
        (RESERVATION_BOOKING_STATUSES.includes(b.status) && b.endDate.getTime() >= now.getTime()),
    )
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  const ctx = empty();
  for (const booking of relevant) {
    if (booking.status === 'ACTIVE') {
      if (ctx.activeBookingId) continue;
      ctx.activeBookingId = booking.id;
      ctx.activeStartAt = booking.startDate.toISOString();
      ctx.activeReturnAt = booking.endDate.toISOString();
      ctx.activeIsOverdue = booking.endDate.getTime() < now.getTime();
      continue;
    }
    if (ctx.activeBookingId || ctx.reservedBookingId) continue;
    ctx.reservedBookingId = booking.id;
    ctx.reservedPickupAt = booking.startDate.toISOString();
    ctx.reservedReturnAt = booking.endDate.toISOString();
    ctx.reservedIsOverdue = booking.startDate.getTime() < now.getTime();
  }

  return ctx;
}

export function wouldLegacyLogicReserveBooking(
  booking: DiagnosticBookingRow,
  now: Date,
): boolean {
  return isLegacyReservationWindowBooking(booking, now);
}

export function hasCurrentReservationWindow(
  bookings: DiagnosticBookingRow[],
  now: Date,
): boolean {
  return bookings.some((b) => isLegacyReservationWindowBooking(b, now));
}

export function activeBookingsForVehicle(
  bookings: DiagnosticBookingRow[],
): DiagnosticBookingRow[] {
  return bookings.filter((b) => b.status === 'ACTIVE');
}

export function reservationWindowBookings(
  bookings: DiagnosticBookingRow[],
  now: Date,
): DiagnosticBookingRow[] {
  return bookings.filter((b) => isLegacyReservationWindowBooking(b, now));
}

export function mapRawVehicleStatusToFleetLabel(status: VehicleStatus): string {
  switch (status) {
    case 'AVAILABLE':
      return 'Available';
    case 'RENTED':
      return 'Active Rented';
    case 'RESERVED':
      return 'Reserved';
    case 'IN_SERVICE':
    case 'OUT_OF_SERVICE':
      return 'Maintenance';
    default:
      return 'Available';
  }
}
