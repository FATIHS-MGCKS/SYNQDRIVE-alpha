import type { VehicleTripAnalytics } from '../../lib/api';
import type { TripBookingRef } from '../components/trips/utils/tripRentalContext';

export interface TelltaleBookingContext {
  booking: TripBookingRef;
}

export interface TelltaleTripContext {
  trip: VehicleTripAnalytics;
}

function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function containsInstant(startIso: string, endIso: string, instant: Date): boolean {
  const start = parseIso(startIso);
  const end = parseIso(endIso);
  if (!start || !end) return false;
  return instant.getTime() >= start.getTime() && instant.getTime() <= end.getTime();
}

export function resolveTelltaleContextInstant(light: {
  observedAt?: string | null;
  lastSeenAt?: string | null;
  lastConfirmedActiveAt?: string | null;
}): string | null {
  return light.lastConfirmedActiveAt ?? light.lastSeenAt ?? light.observedAt ?? null;
}

export function findBookingForTelltale(
  bookings: TripBookingRef[],
  instantIso: string | null | undefined,
): TripBookingRef | null {
  const instant = parseIso(instantIso);
  if (!instant) return null;
  for (const booking of bookings) {
    if (containsInstant(booking.startDate, booking.endDate, instant)) {
      return booking;
    }
  }
  return null;
}

export function findTripForTelltale(
  trips: VehicleTripAnalytics[],
  instantIso: string | null | undefined,
): VehicleTripAnalytics | null {
  const instant = parseIso(instantIso);
  if (!instant) return null;
  const ts = instant.getTime();
  for (const trip of trips) {
    const start = parseIso(trip.startTime);
    if (!start) continue;
    const end = parseIso(trip.endTime ?? trip.startTime) ?? start;
    if (ts >= start.getTime() && ts <= end.getTime()) {
      return trip;
    }
  }
  return null;
}

export function formatTripWindow(trip: VehicleTripAnalytics): string {
  const start = parseIso(trip.startTime);
  const end = parseIso(trip.endTime ?? trip.startTime);
  if (!start) return 'Fahrt';
  const fmt = (d: Date) =>
    d.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  if (!end || end.getTime() === start.getTime()) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}
