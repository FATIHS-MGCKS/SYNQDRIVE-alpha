import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../../lib/api';
import type { EnergyEvent } from '../../../../lib/api';
import { TRIPS_COPY } from '../trips-view-ui';
import type { TripData, TripTimelineItem } from '../trips.types';
import {
  buildMergedTimelineItems,
  localDayRangeIso,
  normalizeTimelineItems,
  splitTimelineItems,
} from '../utils/tripTimeline';
import { useRequestGuard } from './useRequestGuard';

export type TimelineLoadSource = 'canonical' | 'fallback' | 'none';

export interface UseVehicleTripsOptions {
  vehicleId?: string;
  selectedDate?: string;
  selectedDriver?: string;
  onTripsLoaded?: (trips: TripData[]) => void;
}

export function useVehicleTrips({
  vehicleId,
  selectedDate,
  selectedDriver,
  onTripsLoaded,
}: UseVehicleTripsOptions) {
  const [trips, setTrips] = useState<TripData[]>([]);
  const [energyEvents, setEnergyEvents] = useState<EnergyEvent[]>([]);
  const [timelineItems, setTimelineItems] = useState<TripTimelineItem[]>([]);
  const [timelineSource, setTimelineSource] = useState<TimelineLoadSource>('none');
  const [energyEventsWarning, setEnergyEventsWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const onTripsLoadedRef = useRef(onTripsLoaded);
  onTripsLoadedRef.current = onTripsLoaded;
  const loadGuard = useRequestGuard();

  const applyTimelineItems = useCallback((items: TripTimelineItem[], source: TimelineLoadSource) => {
    const { trips: tripList, energyEvents: eventList } = splitTimelineItems(items);
    setTimelineItems(items);
    setTimelineSource(source);
    setTrips(tripList);
    setEnergyEvents(eventList);
    onTripsLoadedRef.current?.(tripList);
  }, []);

  const loadTrips = useCallback(async () => {
    if (!vehicleId) {
      setTrips([]);
      setEnergyEvents([]);
      setTimelineItems([]);
      setTimelineSource('none');
      setEnergyEventsWarning(null);
      onTripsLoadedRef.current?.([]);
      return;
    }
    const seq = loadGuard.next();
    setLoading(true);
    setLoadError(null);
    setEnergyEventsWarning(null);
    try {
      const range = selectedDate ? localDayRangeIso(selectedDate) : undefined;
      const from = range?.from;
      const to = range?.to;
      const driver = selectedDriver && selectedDriver !== 'all' ? selectedDriver : undefined;

      // Primary: server-side canonical timeline (trips + energy events, sorted DESC).
      try {
        const timeline = await api.vehicleIntelligence.tripsTimeline(vehicleId, { from, to, driver });
        if (!loadGuard.isCurrent(seq)) return;
        if (timeline == null) {
          throw new Error('Empty trips timeline response');
        }
        const normalized = normalizeTimelineItems(timeline);
        applyTimelineItems(normalized, 'canonical');
      } catch {
        // Fallback: parallel trips + energyEvents — trips must render even if events fail.
        const [tripsData, eventsResult] = await Promise.all([
          api.vehicleIntelligence.trips(vehicleId, { from, to, driver }),
          api.vehicleIntelligence.energyEvents(vehicleId, { from, to }).catch(() => null),
        ]);
        if (!loadGuard.isCurrent(seq)) return;

        const list = (tripsData ?? []) as TripData[];
        const events = eventsResult ?? [];
        const merged = buildMergedTimelineItems(list, events);
        applyTimelineItems(merged, 'fallback');

        if (eventsResult === null) {
          setEnergyEventsWarning(TRIPS_COPY.energyWarning);
        }
      }
    } catch {
      if (!loadGuard.isCurrent(seq)) return;
      setTrips([]);
      setEnergyEvents([]);
      setTimelineItems([]);
      setTimelineSource('none');
      setEnergyEventsWarning(null);
      setLoadError(TRIPS_COPY.loadTripsFailed);
      onTripsLoadedRef.current?.([]);
    }
    if (loadGuard.isCurrent(seq)) setLoading(false);
  }, [vehicleId, selectedDate, selectedDriver, applyTimelineItems, loadGuard]);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  const handleSync = useCallback(async () => {
    if (!vehicleId || syncing) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await api.vehicleIntelligence.reconcileTrips(vehicleId);
      const applied = res?.applied ?? 0;
      setSyncMessage(
        res?.message ?? (applied === 0 ? TRIPS_COPY.syncNoMissing : TRIPS_COPY.syncRepaired(applied)),
      );
      await loadTrips();
    } catch {
      setSyncMessage(TRIPS_COPY.syncFailed);
    }
    setSyncing(false);
  }, [vehicleId, syncing, loadTrips]);

  const patchTrip = useCallback((tripId: string, patch: Partial<TripData>) => {
    setTrips((prev) => prev.map((t) => (t.id === tripId ? { ...t, ...patch } : t)));
    setTimelineItems((prev) =>
      prev.map((item) =>
        item.itemType === 'trip' && item.trip.id === tripId
          ? { ...item, trip: { ...item.trip, ...patch } }
          : item,
      ),
    );
  }, []);

  return {
    trips,
    energyEvents,
    timelineItems,
    timelineSource,
    energyEventsWarning,
    loading,
    loadError,
    syncing,
    syncMessage,
    loadTrips,
    handleSync,
    patchTrip,
  };
}
