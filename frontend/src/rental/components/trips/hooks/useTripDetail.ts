import { useCallback, useRef, useState } from 'react';
import { api } from '../../../../lib/api';
import type { TripData } from '../trips.types';
import { useRequestGuard } from './useRequestGuard';

export function useTripDetail(vehicleId?: string) {
  const [tripDetails, setTripDetails] = useState<Record<string, TripData>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detailErrorId, setDetailErrorId] = useState<string | null>(null);
  const loadedRef = useRef<Set<string>>(new Set());
  const guard = useRequestGuard();

  const loadTripDetail = useCallback(
    async (tripId: string, selectSeq: number, selectGuard: { isCurrent: (seq: number) => boolean }) => {
      if (!vehicleId || loadedRef.current.has(tripId)) return;
      const seq = guard.next();
      setDetailLoadingId(tripId);
      setDetailErrorId(null);
      try {
        const detail = await api.vehicleIntelligence.tripDetail(vehicleId, tripId);
        if (!selectGuard.isCurrent(selectSeq) || !guard.isCurrent(seq)) return;
        if (detail) {
          loadedRef.current.add(tripId);
          setTripDetails((prev) => ({ ...prev, [tripId]: detail as TripData }));
        } else {
          setDetailErrorId(tripId);
        }
      } catch {
        if (!selectGuard.isCurrent(selectSeq) || !guard.isCurrent(seq)) return;
        setDetailErrorId(tripId);
      }
      if (selectGuard.isCurrent(selectSeq) && guard.isCurrent(seq)) {
        setDetailLoadingId(null);
      }
    },
    [vehicleId, guard],
  );

  const resolveTrip = useCallback(
    (listTrip: TripData): TripData => tripDetails[listTrip.id] ?? listTrip,
    [tripDetails],
  );

  const clearDetailCache = useCallback(() => {
    loadedRef.current.clear();
    setTripDetails({});
    setDetailLoadingId(null);
    setDetailErrorId(null);
  }, []);

  return {
    tripDetails,
    detailLoadingId,
    detailErrorId,
    loadTripDetail,
    resolveTrip,
    clearDetailCache,
  };
}
