import type { TripBehaviorEvent } from '../../../lib/api';
import type { TripTimelineTrip } from './trips.types';
import { countTripEvents } from './trips-map.utils';

/** Count of visible deduped behavior events (API read-model length). */
export function countVisibleBehaviorEvents(
  events: TripBehaviorEvent[] | null | undefined,
): number {
  return events?.length ?? 0;
}

/**
 * Prefer loaded deduped event list over raw trip KPI counters.
 * When `eventsLoaded` is true, an empty array means zero visible events.
 */
export function resolveNotableEventCount(
  trip: TripTimelineTrip,
  events?: TripBehaviorEvent[] | null,
  eventsLoaded = false,
): number | null {
  if (eventsLoaded) return countVisibleBehaviorEvents(events);
  if (events != null && events.length > 0) return events.length;
  return countTripEvents(trip);
}
