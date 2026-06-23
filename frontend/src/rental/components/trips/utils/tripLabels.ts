import type { TripTimelineTrip } from '../trips.types';
import { TRIPS_COPY } from '../trips-view-ui';

export function assignmentLabel(trip: TripTimelineTrip): string {
  if (trip.isPrivateTrip) return 'Privatfahrt';
  switch (trip.assignmentStatus) {
    case 'ASSIGNED_DRIVER':
      return trip.driverName ? `Fahrer: ${trip.driverName}` : 'Fahrer zugewiesen';
    case 'ASSIGNED_BOOKING_CUSTOMER':
      return 'Buchungskunde';
    case 'PRIVATE_UNASSIGNED':
      return 'Privat / nicht zugewiesen';
    case 'UNKNOWN_ASSIGNMENT':
      return 'Zuordnung unbekannt';
    default:
      return trip.driverName ? `Fahrer: ${trip.driverName}` : 'Keine Zuordnung';
  }
}

export function assignmentSubjectTypeLabel(
  subjectType: TripTimelineTrip['assignmentSubjectType'],
): string | null {
  if (!subjectType) return null;
  return subjectType === 'DRIVER' ? 'Fahrer' : 'Buchungskunde';
}

export function routeStatusLabel(
  routeLoading: boolean,
  routeError: string | null,
  routePointsCount: number,
): string {
  if (routeLoading) return TRIPS_COPY.loadingRoute;
  if (routeError) return routeError;
  if (routePointsCount > 0) return 'Route verfügbar';
  return TRIPS_COPY.routeUnavailable;
}
