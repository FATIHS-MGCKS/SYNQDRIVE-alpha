import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../../lib/api';
import type { TripM7aMapPayload } from '../m7a-map.types';
import { useRequestGuard } from './useRequestGuard';

export function useTripM7aMap(vehicleId?: string, tripId?: string | null) {
  const [payload, setPayload] = useState<TripM7aMapPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const loadedForRef = useRef<string | null>(null);
  const guard = useRequestGuard();

  const load = useCallback(async () => {
    if (!vehicleId || !tripId) {
      setPayload(null);
      loadedForRef.current = null;
      return;
    }
    const key = `${vehicleId}:${tripId}`;
    if (loadedForRef.current === key) return;
    const seq = guard.next();
    setLoading(true);
    setError(false);
    try {
      const data = await api.vehicleIntelligence.tripM7aRoadAssignmentShadow(vehicleId, tripId);
      if (!guard.isCurrent(seq)) return;
      loadedForRef.current = key;
      setPayload(data as TripM7aMapPayload);
    } catch {
      if (!guard.isCurrent(seq)) return;
      setError(true);
      setPayload(null);
    } finally {
      if (guard.isCurrent(seq)) setLoading(false);
    }
  }, [vehicleId, tripId, guard]);

  useEffect(() => {
    loadedForRef.current = null;
    setPayload(null);
    void load();
  }, [vehicleId, tripId]); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = useCallback(() => {
    loadedForRef.current = null;
    setPayload(null);
    setError(false);
    setLoading(false);
  }, []);

  return { payload, loading, error, reload: load, clear };
}
