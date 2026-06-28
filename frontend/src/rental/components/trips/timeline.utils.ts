import type { OperationalChip, TripDaySummary, TripTimelineTrip } from './trips.types';
import type { TripRentalContextView } from './utils/tripRentalContext';
import {
  formatTripDate,
  formatTripDateLong,
  formatTripDistance,
  formatTripDuration,
  formatTripTime,
} from './utils/tripFormatters';
import {
  getEventsSummary,
  getOperatorStressLabel,
  hasAbuseSuspicion,
} from './utils/tripStatus';
import { groupTimelineByDate, summarizeDay } from './utils/tripTimeline';

export { formatTripDate, formatTripDateLong, formatTripTime, formatTripDistance, formatTripDuration };
export { groupTimelineByDate, summarizeDay };
export type { TripTimelineDateGroup } from './utils/tripTimeline';

// Compact card line: distance + duration only. Aggregate trip speeds
// (maxSpeedKmh) come from a separate low-frequency segment pipeline and can be
// implausible vs. HF behavior-event speeds — so we do not surface them here.
export function buildInstantLine(trip: TripTimelineTrip): string {
  return [formatTripDistance(trip.distanceKm), formatTripDuration(trip.durationMinutes)].join(' · ');
}

export function buildStatusLine(trip: TripTimelineTrip): string {
  return `${getOperatorStressLabel(trip)} · ${getEventsSummary(trip)}`;
}

export { getOperatorStressLabel, getEventsSummary, hasAbuseSuspicion };

export function hasTripDeviceConnectionAlert(trip: TripTimelineTrip): boolean {
  return (
    trip.hasDeviceConnectionEvent === true &&
    (trip.deviceUnpluggedCount ?? 0) > 0
  );
}

/**
 * Compact, operator-facing chips for a collapsed trip card.
 * Strictly limited to at most three meaningful signals:
 *  1) rating (Aktiv / Auffällige Fahrt / Unauffällig)
 *  2) suspicion (Missbrauchsverdacht — only with real abuse events)
 *  3) one assignment-context chip (Privat / Buchung unklar / verknüpft / …)
 * No route/HF/map-match/data-quality/debug chips — those live in the
 * expanded Beweisübersicht, never as collapsed-card noise.
 */
export function deriveOperationalChips(
  trip: TripTimelineTrip,
  rentalContext?: TripRentalContextView,
): OperationalChip[] {
  const chips: OperationalChip[] = [];
  const isPrivate = !!trip.isPrivateTrip || trip.assignmentStatus === 'PRIVATE_UNASSIGNED';
  const hasAbuse = (trip.abuseEvents ?? trip.abuseEventCount ?? 0) > 0;

  // 1) Rating
  if (trip.tripStatus === 'ONGOING') {
    chips.push({ key: 'ongoing', label: 'Aktiv', tone: 'watch' });
  } else if (hasAbuseSuspicion(trip)) {
    chips.push({ key: 'notable', label: 'Auffällige Fahrt', tone: 'critical' });
  } else {
    chips.push({ key: 'unremarkable', label: 'Unauffällig', tone: 'neutral' });
  }

  // 2) OBD plug/unplug during trip — high-priority operational signal
  if (hasTripDeviceConnectionAlert(trip)) {
    const rental = trip.deviceConnectionRentalRelevant === true;
    chips.push({
      key: 'device-unplug',
      label: rental ? 'Telematik abgezogen' : 'OBD getrennt',
      tone: rental || trip.hasOpenDeviceUnplug ? 'critical' : 'watch',
    });
  } else if (
    trip.hasDeviceConnectionEvent &&
    (trip.devicePluggedInCount ?? 0) > 0 &&
    (trip.deviceUnpluggedCount ?? 0) === 0
  ) {
    chips.push({
      key: 'device-plug',
      label: 'OBD verbunden',
      tone: 'info',
    });
  }

  // 3) Suspicion — only when concrete abuse events exist
  if (hasAbuse) {
    chips.push({ key: 'abuse', label: 'Missbrauchsverdacht', tone: 'critical' });
  }

  // 4) Assignment context — exactly one, private wins and suppresses the rest
  if (isPrivate) {
    chips.push({ key: 'private', label: 'Privat', tone: 'private' });
  } else if (rentalContext?.needsReview || trip.assignmentStatus === 'UNKNOWN_ASSIGNMENT') {
    chips.push({ key: 'review', label: 'Buchung unklar', tone: 'watch' });
  } else if (trip.assignmentStatus === 'ASSIGNED_BOOKING_CUSTOMER' || trip.assignedBookingId) {
    chips.push({ key: 'booking', label: 'Buchung verknüpft', tone: 'info' });
  } else if (trip.assignmentStatus === 'ASSIGNED_DRIVER' && trip.driverName) {
    chips.push({ key: 'driver', label: trip.driverName, tone: 'info' });
  } else if (trip.tripStatus === 'COMPLETED') {
    chips.push({ key: 'no-booking', label: 'Ohne Buchung', tone: 'watch' });
  }

  return chips.slice(0, 3);
}

export type { TripDaySummary };
