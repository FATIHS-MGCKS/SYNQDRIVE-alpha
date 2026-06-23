import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../../lib/api';
import type { TripBehaviorEvent } from '../../../../lib/api';
import type { BehaviorEnrichmentStatus, TripData } from '../trips.types';
import { useRequestGuard } from './useRequestGuard';

export interface UseTripBehaviorEventsOptions {
  vehicleId?: string;
  selectedTrip: TripData | null;
  patchTrip: (tripId: string, patch: Partial<TripData>) => void;
  onTripsReload: () => void;
  selectGuard: { isCurrent: (seq: number) => boolean };
}

export function useTripBehaviorEvents({
  vehicleId,
  selectedTrip,
  patchTrip,
  onTripsReload,
  selectGuard,
}: UseTripBehaviorEventsOptions) {
  const [behaviorEvents, setBehaviorEvents] = useState<Record<string, TripBehaviorEvent[]>>({});
  const [behaviorLoading, setBehaviorLoading] = useState<string | null>(null);
  const [selectedBehaviorEventId, setSelectedBehaviorEventId] = useState<string | null>(null);
  const autoEnrichTriggeredRef = useRef<Set<string>>(new Set());
  const loadedBehaviorTripsRef = useRef<Set<string>>(new Set());
  const behaviorGuard = useRequestGuard();

  const loadBehaviorForTrip = useCallback(
    async (tripId: string, selectSeq: number) => {
      if (!vehicleId || loadedBehaviorTripsRef.current.has(tripId)) return;
      setBehaviorLoading(tripId);
      const seq = behaviorGuard.next();
      try {
        const res = await api.vehicleIntelligence.tripBehaviorEvents(vehicleId, tripId);
        if (!selectGuard.isCurrent(selectSeq) || !behaviorGuard.isCurrent(seq)) return;
        loadedBehaviorTripsRef.current.add(tripId);
        if (res?.status === 'ready') {
          setBehaviorEvents((prev) => ({ ...prev, [tripId]: res.events ?? [] }));
        } else {
          setBehaviorEvents((prev) => ({ ...prev, [tripId]: [] }));
        }
      } catch {
        /* silent */
      }
      if (selectGuard.isCurrent(selectSeq) && behaviorGuard.isCurrent(seq)) {
        setBehaviorLoading(null);
      }
    },
    [vehicleId, selectGuard, behaviorGuard],
  );

  const enrichBehavior = useCallback(
    async (tripId: string) => {
      if (!vehicleId) return;
      loadedBehaviorTripsRef.current.delete(tripId);
      setBehaviorLoading(tripId);
      const seq = behaviorGuard.next();
      try {
        await api.vehicleIntelligence.enrichTripBehavior(vehicleId, tripId);
        const res = await api.vehicleIntelligence.tripBehaviorEvents(vehicleId, tripId);
        if (!behaviorGuard.isCurrent(seq)) return;
        loadedBehaviorTripsRef.current.add(tripId);
        setBehaviorEvents((prev) => ({
          ...prev,
          [tripId]: res?.status === 'ready' ? (res.events ?? []) : [],
        }));
        onTripsReload();
      } catch {
        /* silent */
      }
      if (behaviorGuard.isCurrent(seq)) setBehaviorLoading(null);
    },
    [vehicleId, onTripsReload, behaviorGuard],
  );

  const clearSelectedBehaviorEvent = useCallback(() => {
    setSelectedBehaviorEventId(null);
  }, []);

  const invalidateBehaviorCache = useCallback((tripId: string) => {
    loadedBehaviorTripsRef.current.delete(tripId);
    setBehaviorEvents((prev) => {
      const next = { ...prev };
      delete next[tripId];
      return next;
    });
  }, []);

  const resetBehaviorState = useCallback(() => {
    loadedBehaviorTripsRef.current.clear();
    autoEnrichTriggeredRef.current.clear();
    setBehaviorEvents({});
    setBehaviorLoading(null);
    setSelectedBehaviorEventId(null);
  }, []);

  useEffect(() => {
    if (!selectedTrip || !vehicleId || behaviorLoading) return;
    if (selectedTrip.tripStatus !== 'COMPLETED') return;
    if (selectedTrip.behaviorReady === true) return;
    const status = selectedTrip.behaviorEnrichmentStatus;
    if (status !== null && status !== undefined) return;
    if (autoEnrichTriggeredRef.current.has(selectedTrip.id)) return;

    autoEnrichTriggeredRef.current.add(selectedTrip.id);
    const tripId = selectedTrip.id;
    patchTrip(tripId, { behaviorEnrichmentStatus: 'IN_PROGRESS' as BehaviorEnrichmentStatus });
    setBehaviorLoading(tripId);

    const seq = behaviorGuard.next();
    api.vehicleIntelligence
      .enrichTripBehavior(vehicleId, tripId)
      .then(async () => {
        const evts = await api.vehicleIntelligence.tripBehaviorEvents(vehicleId, tripId).catch(() => null);
        if (!behaviorGuard.isCurrent(seq)) return;
        loadedBehaviorTripsRef.current.add(tripId);
        setBehaviorEvents((prev) => ({ ...prev, [tripId]: evts?.events ?? [] }));
        onTripsReload();
      })
      .catch(() => {
        if (!behaviorGuard.isCurrent(seq)) return;
        patchTrip(tripId, { behaviorEnrichmentStatus: 'FAILED_TRANSIENT' as BehaviorEnrichmentStatus });
      })
      .finally(() => {
        if (behaviorGuard.isCurrent(seq)) setBehaviorLoading(null);
      });
  }, [selectedTrip?.id, vehicleId, behaviorLoading, patchTrip, onTripsReload, behaviorGuard]);

  return {
    behaviorEvents,
    behaviorLoading,
    selectedBehaviorEventId,
    setSelectedBehaviorEventId,
    clearSelectedBehaviorEvent,
    loadBehaviorForTrip,
    enrichBehavior,
    invalidateBehaviorCache,
    resetBehaviorState,
  };
}
