import type { TripTimelineTrip } from '../trips.types';
import { countTripEvents } from '../trips-map.utils';

export interface TripsPeriodSummary {
  tripCount: number;
  totalKm: number;
  totalMinutes: number;
  notableEvents: number;
  privateCount: number;
  limitedDataCount: number;
  ongoingCount: number;
  unlinkedCount: number;
}

export function computeTripsPeriodSummary(trips: TripTimelineTrip[]): TripsPeriodSummary {
  let totalKm = 0;
  let totalMinutes = 0;
  let notableEvents = 0;
  let privateCount = 0;
  let limitedDataCount = 0;
  let ongoingCount = 0;
  let unlinkedCount = 0;

  for (const trip of trips) {
    totalKm += trip.distanceKm ?? 0;
    totalMinutes += trip.durationMinutes ?? 0;
    const ev = countTripEvents(trip);
    if (ev != null) notableEvents += ev;
    if (trip.isPrivateTrip || trip.assignmentStatus === 'PRIVATE_UNASSIGNED') privateCount += 1;
    if (trip.detailsLimited || trip.behaviorEnrichmentStatus === 'SKIPPED_NO_HF_DATA') {
      limitedDataCount += 1;
    }
    if (trip.tripStatus === 'ONGOING') ongoingCount += 1;
    if (
      !trip.assignedBookingId &&
      trip.assignmentStatus !== 'ASSIGNED_BOOKING_CUSTOMER' &&
      trip.tripStatus === 'COMPLETED' &&
      !trip.isPrivateTrip
    ) {
      unlinkedCount += 1;
    }
  }

  return {
    tripCount: trips.length,
    totalKm,
    totalMinutes,
    notableEvents,
    privateCount,
    limitedDataCount,
    ongoingCount,
    unlinkedCount,
  };
}

export function formatSelectedPeriodLabel(selectedDate?: string): string {
  if (!selectedDate) return 'Gesamter Verlauf';
  const [y, m, d] = selectedDate.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Compact date for the Trips overview card header (title row). */
export function formatSelectedPeriodHeaderDate(selectedDate?: string): string {
  if (!selectedDate) return 'Gesamter Verlauf';
  const [y, m, d] = selectedDate.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return date.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
