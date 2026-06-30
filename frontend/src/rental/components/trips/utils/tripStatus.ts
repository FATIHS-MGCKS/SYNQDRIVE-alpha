import { getStressLevel, resolveDrivingStressScore } from '../../../lib/scoreFormat';
import type { TripBehaviorEvent } from '../../../../lib/api';
import type { TripTimelineTrip } from '../trips.types';
import { resolveNotableEventCount } from '../behavior-event-count.utils';

export function getOperatorStressLabel(trip: TripTimelineTrip): string {
  const score = resolveDrivingStressScore(trip);
  const level = trip.stressLevel ?? getStressLevel(score);
  if (score == null && level == null) return '—';
  switch (level) {
    case 'low':
      return 'Normal';
    case 'moderate':
      return 'Beobachten';
    case 'high':
      return 'Auffällig';
    case 'critical':
      return 'Kritisch';
    default:
      return 'Normal';
  }
}

export function getEventsSummary(
  trip: TripTimelineTrip,
  behaviorEventsByTripId?: Record<string, TripBehaviorEvent[]>,
): string {
  const eventsLoaded =
    behaviorEventsByTripId != null &&
    Object.prototype.hasOwnProperty.call(behaviorEventsByTripId, trip.id);
  const count = resolveNotableEventCount(
    trip,
    behaviorEventsByTripId?.[trip.id],
    eventsLoaded,
  );
  if (count == null) return 'Analyse läuft';
  if (count === 0) return 'Keine Ereignisse';
  return `${count} ${count === 1 ? 'Ereignis' : 'Ereignisse'}`;
}

export function getTripStatusLabel(status: TripTimelineTrip['tripStatus']): string {
  switch (status) {
    case 'ONGOING':
      return 'Aktiv';
    case 'COMPLETED':
      return 'Abgeschlossen';
    case 'CANCELLED':
      return 'Abgebrochen';
    default:
      return status;
  }
}

export function hasAbuseSuspicion(trip: TripTimelineTrip): boolean {
  const abuse = trip.abuseEvents ?? trip.abuseEventCount ?? 0;
  const level = trip.stressLevel ?? getStressLevel(resolveDrivingStressScore(trip));
  return abuse > 0 || level === 'critical' || level === 'high';
}

export function isSyncMessageSuccess(message: string | null): boolean {
  if (message == null) return false;
  return (
    message.includes('Keine fehlenden') ||
    message.includes('ergänzt') ||
    message.includes('ergÃ¤nzt') ||
    message.includes('repaired') ||
    message.includes('found')
  );
}
