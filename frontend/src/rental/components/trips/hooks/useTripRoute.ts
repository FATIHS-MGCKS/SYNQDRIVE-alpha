import { useCallback, useState } from 'react';
import { api } from '../../../../lib/api';
import { TRIPS_COPY } from '../trips-view-ui';
import type { TripData, TripRoutePoint } from '../trips.types';
import { useRequestGuard } from './useRequestGuard';

export function useTripRoute(vehicleId?: string) {
  const [routePoints, setRoutePoints] = useState<TripRoutePoint[]>([]);
  const [routeTripId, setRouteTripId] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const routeGuard = useRequestGuard();

  const resetRoute = useCallback(() => {
    setRoutePoints([]);
    setRouteTripId(null);
    setRouteLoading(false);
    setRouteError(null);
  }, []);

  const loadRouteForTrip = useCallback(
    async (tripId: string, selectSeq: number, selectGuard: { isCurrent: (seq: number) => boolean }) => {
      if (!vehicleId) {
        setRouteLoading(false);
        return;
      }
      setRoutePoints([]);
      setRouteTripId(tripId);
      setRouteLoading(true);
      setRouteError(null);
      try {
        const route = await api.vehicleIntelligence.tripRoute(vehicleId, tripId);
        if (!selectGuard.isCurrent(selectSeq)) return;
        const points = (route ?? []) as TripRoutePoint[];
        setRoutePoints(points);
        if (points.length === 0) setRouteError(TRIPS_COPY.routeUnavailable);
      } catch {
        if (!selectGuard.isCurrent(selectSeq)) return;
        setRoutePoints([]);
        setRouteError(TRIPS_COPY.routeUnavailable);
      }
      if (selectGuard.isCurrent(selectSeq)) setRouteLoading(false);
    },
    [vehicleId],
  );

  const reloadRoute = useCallback(
    async (trip: TripData) => {
      if (!vehicleId) return;
      const seq = routeGuard.next();
      setRouteTripId(trip.id);
      setRouteLoading(true);
      setRouteError(null);
      try {
        const route = await api.vehicleIntelligence.tripRoute(vehicleId, trip.id);
        if (!routeGuard.isCurrent(seq)) return;
        const points = (route ?? []) as TripRoutePoint[];
        setRoutePoints(points);
        if (points.length === 0) setRouteError(TRIPS_COPY.routeUnavailable);
      } catch {
        if (!routeGuard.isCurrent(seq)) return;
        setRoutePoints([]);
        setRouteError(TRIPS_COPY.routeUnavailable);
      }
      if (routeGuard.isCurrent(seq)) setRouteLoading(false);
    },
    [vehicleId, routeGuard],
  );

  const isRouteForTrip = useCallback(
    (tripId: string | null) => tripId != null && routeTripId === tripId,
    [routeTripId],
  );

  return {
    routePoints,
    routeTripId,
    routeLoading,
    routeError,
    resetRoute,
    loadRouteForTrip,
    reloadRoute,
    isRouteForTrip,
  };
}
