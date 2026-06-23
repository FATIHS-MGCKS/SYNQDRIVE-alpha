import { useMemo } from 'react';
import type { EnergyEvent } from '../../../../lib/api';
import type { TripData, TripTimelineItem } from '../trips.types';
import { buildMergedTimelineItems } from '../utils/tripTimeline';

/**
 * Fallback merge when `tripsTimeline` is unavailable.
 * Prefer canonical `timelineItems` from `useVehicleTrips`.
 */
export function useTripsTimeline(trips: TripData[], energyEvents: EnergyEvent[]) {
  const timelineItems = useMemo<TripTimelineItem[]>(
    () => buildMergedTimelineItems(trips, energyEvents),
    [trips, energyEvents],
  );

  return { timelineItems };
}
