import type { TripTimelineItem } from '../trips.types';

/** Chronological trip index per calendar day (earliest start = 1). */
export function computeDayTripNumbers(items: TripTimelineItem[]): Map<string, number> {
  const trips = items
    .filter((item): item is Extract<TripTimelineItem, { itemType: 'trip' }> => item.itemType === 'trip')
    .map((item) => item.trip)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const map = new Map<string, number>();
  trips.forEach((trip, index) => map.set(trip.id, index + 1));
  return map;
}
