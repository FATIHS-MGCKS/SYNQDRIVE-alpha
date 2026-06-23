import type { TripEnrichment } from './trips.types';
import type { OperationalChip, TripDaySummary, TripTimelineTrip } from './trips.types';
import {
  alignmentToChipTone,
  type TripRentalContextView,
} from './utils/tripRentalContext';
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
  getSpeedSummary,
  hasAbuseSuspicion,
} from './utils/tripStatus';
import { groupTimelineByDate, summarizeDay } from './utils/tripTimeline';

export { formatTripDate, formatTripDateLong, formatTripTime, formatTripDistance, formatTripDuration };
export { groupTimelineByDate, summarizeDay };
export type { TripTimelineDateGroup } from './utils/tripTimeline';

export function buildInstantLine(trip: TripTimelineTrip): string {
  const parts = [formatTripDistance(trip.distanceKm), formatTripDuration(trip.durationMinutes)];
  const speed = getSpeedSummary(trip);
  if (speed) parts.push(speed);
  return parts.join(' · ');
}

export function buildStatusLine(trip: TripTimelineTrip): string {
  return `${getOperatorStressLabel(trip)} · ${getEventsSummary(trip)}`;
}

export { getOperatorStressLabel, getEventsSummary, hasAbuseSuspicion };

export function deriveOperationalChips(
  trip: TripTimelineTrip,
  enrichment: TripEnrichment | undefined,
  opts: {
    isSelected: boolean;
    routePointsCount: number;
    routeError: string | null;
    behaviorLoading: boolean;
  },
  rentalContext?: TripRentalContextView,
): OperationalChip[] {
  const chips: OperationalChip[] = [];

  if (hasAbuseSuspicion(trip)) {
    chips.push({ key: 'notable', label: 'Auffällige Fahrt', tone: 'critical' });
  }

  if (trip.tripStatus === 'ONGOING') {
    chips.push({ key: 'ongoing', label: 'Aktiv', tone: 'watch' });
  }

  if (trip.isPrivateTrip) {
    chips.push({ key: 'private', label: 'Privat', tone: 'private' });
  }

  if (trip.assignmentStatus === 'PRIVATE_UNASSIGNED' || trip.assignmentStatus === 'UNKNOWN_ASSIGNMENT') {
    chips.push({ key: 'unassigned', label: 'Nicht zugewiesen', tone: 'neutral' });
  }

  if (!trip.assignedBookingId && trip.assignmentStatus !== 'ASSIGNED_BOOKING_CUSTOMER' && !trip.isPrivateTrip) {
    if (trip.tripStatus === 'COMPLETED') {
      chips.push({ key: 'no-booking', label: 'Ohne Buchung', tone: 'watch' });
    }
  } else if (trip.assignmentStatus === 'ASSIGNED_BOOKING_CUSTOMER' || trip.assignedBookingId) {
    chips.push({ key: 'booking', label: 'Buchung verknüpft', tone: 'info' });
  } else if (trip.assignmentStatus === 'ASSIGNED_DRIVER' && trip.driverName) {
    chips.push({ key: 'driver', label: trip.driverName, tone: 'info' });
  }

  const alignmentChip = rentalContext?.alignment.find(
    (h) => h.kind !== 'within_rental' && h.kind !== 'context_unavailable',
  );
  if (alignmentChip) {
    chips.push({
      key: `align-${alignmentChip.kind}`,
      label: alignmentChip.label,
      tone: alignmentToChipTone(alignmentChip.tone),
    });
  }

  if (rentalContext?.needsReview && !chips.some((c) => c.key === 'no-booking')) {
    chips.push({ key: 'review', label: 'Zuordnung prüfen', tone: 'watch' });
  }

  if (trip.detailsLimited) {
    chips.push({ key: 'route-partial', label: 'Route unvollständig', tone: 'watch' });
  } else if (opts.isSelected && opts.routeError) {
    chips.push({ key: 'route-missing', label: 'Route unvollständig', tone: 'watch' });
  } else if (opts.isSelected && opts.routePointsCount > 0) {
    chips.push({ key: 'route-ok', label: 'Route verfügbar', tone: 'success' });
  }

  if ((enrichment?.mapMatchConfidence ?? 0) > 0.5) {
    chips.push({ key: 'matched', label: 'Route abgeglichen', tone: 'success' });
  }

  if (trip.behaviorEnrichmentStatus === 'SKIPPED_NO_HF_DATA' || trip.detailsLimited) {
    if (!chips.some((c) => c.key === 'route-partial')) {
      chips.push({ key: 'hf-limited', label: 'Telemetrie eingeschränkt', tone: 'watch' });
    }
  } else if (trip.behaviorReady) {
    chips.push({ key: 'hf-ok', label: 'HF verfügbar', tone: 'success' });
  } else if (opts.behaviorLoading || trip.behaviorReady === false) {
    chips.push({ key: 'hf-pending', label: 'Analyse läuft', tone: 'neutral' });
  }

  if (trip.gapEnded) {
    chips.push({ key: 'gap', label: 'Datenlücke', tone: 'watch' });
  }

  return chips;
}

export type { TripDaySummary };
