import type { BookingStatus } from '@prisma/client';
import { resolveZonedCalendarDayWindow } from '@modules/bookings/booking-day-window.util';
import { DEFAULT_TARIFF_TIMEZONE, zonedDateOnly } from '@modules/pricing/tariff-instant.util';
import type { FleetVehicleBookingContextDto } from '../vehicles.service';

const RESERVATION_BOOKING_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED'];

export type FleetBookingContextRow = {
  id: string;
  vehicleId: string;
  status: BookingStatus;
  startDate: Date;
  endDate: Date;
  kmIncluded: number | null;
  kmDriven: number | null;
  pickupStationId: string | null;
  returnStationId: string | null;
  customer: { firstName: string; lastName: string; company: string | null };
};

export type FleetVehicleBookingSupplementDto = {
  nextBookingId: string | null;
  nextBookingCustomerName: string | null;
  nextBookingPickupAt: string | null;
  nextBookingReturnAt: string | null;
  nextBookingPickupStationName: string | null;
  futureBookingCount: number;
};

export type FleetBookingContextBuildResult = {
  map: Map<string, FleetVehicleBookingContextDto>;
  supplements: Map<string, FleetVehicleBookingSupplementDto>;
};

export function resolveOrgTimezone(timezone: string | null | undefined): string {
  const tz = timezone?.trim();
  return tz && tz.length > 0 ? tz : DEFAULT_TARIFF_TIMEZONE;
}

export function isLegacyReservationWindowBooking(
  booking: Pick<FleetBookingContextRow, 'status' | 'endDate'>,
  now: Date,
): boolean {
  return (
    RESERVATION_BOOKING_STATUSES.includes(booking.status) &&
    booking.endDate.getTime() >= now.getTime()
  );
}

/** Pickup calendar day reached in org timezone — canonical Reserved window. */
export function isCanonicalPickupReservationDay(
  booking: Pick<FleetBookingContextRow, 'startDate'>,
  now: Date,
  timezone: string,
): boolean {
  const tz = resolveOrgTimezone(timezone);
  const { dateOnly: todayDateOnly } = resolveZonedCalendarDayWindow(now, tz);
  const pickupDateOnly = zonedDateOnly(booking.startDate, tz);
  return pickupDateOnly <= todayDateOnly;
}

export function wouldCanonicalLogicReserveBooking(
  booking: Pick<FleetBookingContextRow, 'status' | 'startDate' | 'endDate'>,
  now: Date,
  timezone: string,
): boolean {
  return (
    isLegacyReservationWindowBooking(booking, now) &&
    isCanonicalPickupReservationDay(booking, now, timezone)
  );
}

export function emptyFleetBookingContext(): FleetVehicleBookingContextDto {
  return {
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
  };
}

export function emptyFleetBookingSupplement(): FleetVehicleBookingSupplementDto {
  return {
    nextBookingId: null,
    nextBookingCustomerName: null,
    nextBookingPickupAt: null,
    nextBookingReturnAt: null,
    nextBookingPickupStationName: null,
    futureBookingCount: 0,
  };
}

export function buildFleetBookingContextFromRows(input: {
  rows: FleetBookingContextRow[];
  now: Date;
  orgTimezone: string;
  stationMap: Map<string, string>;
  fmtCustomer: (c: FleetBookingContextRow['customer']) => string;
}): FleetBookingContextBuildResult {
  const { rows, now, orgTimezone, stationMap, fmtCustomer } = input;
  const map = new Map<string, FleetVehicleBookingContextDto>();
  const futureCandidates = new Map<string, FleetBookingContextRow[]>();

  for (const row of rows) {
    if (row.status === 'ACTIVE') {
      const existing = map.get(row.vehicleId) ?? emptyFleetBookingContext();
      if (existing.activeBookingId) continue;
      existing.activeBookingId = row.id;
      existing.activeCustomerName = fmtCustomer(row.customer);
      existing.activeStartAt = row.startDate.toISOString();
      existing.activeReturnAt = row.endDate.toISOString();
      existing.activeReturnStationName = row.returnStationId
        ? stationMap.get(row.returnStationId) ?? null
        : null;
      existing.activeKmIncluded = row.kmIncluded ?? null;
      existing.activeKmDriven = row.kmDriven ?? null;
      existing.activeIsOverdue = row.endDate.getTime() < now.getTime();
      map.set(row.vehicleId, existing);
      continue;
    }

    if (!isLegacyReservationWindowBooking(row, now)) continue;

    if (wouldCanonicalLogicReserveBooking(row, now, orgTimezone)) {
      const existing = map.get(row.vehicleId) ?? emptyFleetBookingContext();
      if (existing.activeBookingId || existing.reservedBookingId) {
        map.set(row.vehicleId, existing);
        continue;
      }
      existing.reservedBookingId = row.id;
      existing.reservedCustomerName = fmtCustomer(row.customer);
      existing.reservedPickupAt = row.startDate.toISOString();
      existing.reservedReturnAt = row.endDate.toISOString();
      existing.reservedPickupStationName = row.pickupStationId
        ? stationMap.get(row.pickupStationId) ?? null
        : null;
      existing.reservedIsOverdue = row.startDate.getTime() < now.getTime();
      map.set(row.vehicleId, existing);
      continue;
    }

    const candidates = futureCandidates.get(row.vehicleId) ?? [];
    candidates.push(row);
    futureCandidates.set(row.vehicleId, candidates);
  }

  const supplements = new Map<string, FleetVehicleBookingSupplementDto>();
  for (const [vehicleId, candidates] of futureCandidates) {
    const sorted = [...candidates].sort(
      (a, b) => a.startDate.getTime() - b.startDate.getTime(),
    );
    const next = sorted[0];
    if (!next) continue;
    supplements.set(vehicleId, {
      nextBookingId: next.id,
      nextBookingCustomerName: fmtCustomer(next.customer),
      nextBookingPickupAt: next.startDate.toISOString(),
      nextBookingReturnAt: next.endDate.toISOString(),
      nextBookingPickupStationName: next.pickupStationId
        ? stationMap.get(next.pickupStationId) ?? null
        : null,
      futureBookingCount: sorted.length,
    });
  }

  return { map, supplements };
}
