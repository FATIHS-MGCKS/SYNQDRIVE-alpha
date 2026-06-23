import type { EnergyEvent } from '../../../../lib/api';
import type { TripData, TripDaySummary, TripTimelineItem, TripTimelineTrip } from '../trips.types';
import { dateKeyFromIso, formatTripDateLong } from './tripFormatters';
import { countTripEvents } from '../trips-map.utils';

/**
 * Normalizes API `trips-timeline` items (flat trip/event fields + itemType)
 * into the nested UI shape `{ trip }` / `{ event }`.
 */
export function normalizeTimelineItem(item: unknown): TripTimelineItem {
  const raw = item as Record<string, unknown>;
  if (raw.itemType === 'trip') {
    if (raw.trip && typeof raw.trip === 'object') {
      return raw as TripTimelineItem;
    }
    const { itemType: _i, ...tripFields } = raw;
    const trip = tripFields as unknown as TripData;
    return {
      itemType: 'trip',
      id: String(trip.id),
      startTime: String(trip.startTime),
      trip,
    };
  }
  if (raw.itemType === 'energy-event') {
    if (raw.event && typeof raw.event === 'object') {
      return raw as TripTimelineItem;
    }
    const { itemType: _i, ...eventFields } = raw;
    const event = eventFields as unknown as EnergyEvent;
    return {
      itemType: 'energy-event',
      id: event.id,
      startTime: event.startTime,
      event,
    };
  }
  throw new Error(`Unbekanntes Timeline-Item: ${String(raw.itemType)}`);
}

export function normalizeTimelineItems(items: unknown[]): TripTimelineItem[] {
  return items.map(normalizeTimelineItem);
}

/**
 * Builds a UTC ISO timestamp for the start/end of a **local** calendar day.
 * See V4.6.71 — date picker yields local day; trailing Z would misalign filters.
 */
export function localDayRangeIso(dateYMD: string): { from: string; to: string } {
  const [y, m, d] = dateYMD.split('-').map(Number);
  const start = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  const end = new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function splitTimelineItems(items: TripTimelineItem[]): {
  trips: TripData[];
  energyEvents: EnergyEvent[];
} {
  const trips: TripData[] = [];
  const energyEvents: EnergyEvent[] = [];
  for (const item of items) {
    if (item.itemType === 'trip') {
      trips.push(item.trip as TripData);
    } else if (item.itemType === 'energy-event') {
      energyEvents.push(item.event);
    }
  }
  return { trips, energyEvents };
}

export function buildMergedTimelineItems(
  trips: TripTimelineTrip[],
  energyEvents: EnergyEvent[],
): TripTimelineItem[] {
  const tripItems: TripTimelineItem[] = trips.map((trip) => ({
    itemType: 'trip',
    id: trip.id,
    startTime: trip.startTime,
    trip,
  }));
  const eventItems: TripTimelineItem[] = energyEvents.map((event) => ({
    itemType: 'energy-event',
    id: event.id,
    startTime: event.startTime,
    event,
  }));
  return [...tripItems, ...eventItems].sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
  );
}

export function summarizeDay(trips: TripTimelineTrip[]): TripDaySummary {
  let totalKm = 0;
  let totalMinutes = 0;
  let notableEvents = 0;
  let privateCount = 0;

  for (const trip of trips) {
    totalKm += trip.distanceKm ?? 0;
    totalMinutes += trip.durationMinutes ?? 0;
    const ev = countTripEvents(trip);
    if (ev != null) notableEvents += ev;
    if (trip.isPrivateTrip || trip.assignmentStatus === 'PRIVATE_UNASSIGNED') privateCount += 1;
  }

  return {
    tripCount: trips.length,
    totalKm,
    totalMinutes,
    notableEvents,
    privateCount,
  };
}

export interface TripTimelineDateGroup {
  dateKey: string;
  dateLabel: string;
  items: TripTimelineItem[];
  summary: TripDaySummary;
}

export function groupTimelineByDate(items: TripTimelineItem[]): TripTimelineDateGroup[] {
  const map = new Map<string, TripTimelineItem[]>();

  for (const item of items) {
    const key = dateKeyFromIso(item.startTime);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, groupItems]) => {
      const trips = groupItems
        .filter((i): i is Extract<TripTimelineItem, { itemType: 'trip' }> => i.itemType === 'trip')
        .map((i) => i.trip);
      return {
        dateKey,
        dateLabel: formatTripDateLong(groupItems[0]?.startTime ?? dateKey),
        items: groupItems,
        summary: summarizeDay(trips),
      };
    });
}
