import { useCallback, useEffect, useRef, useState } from 'react';
import type { CanonicalTripRouteResponse } from '../../../../lib/api';
import { api } from '../../../../lib/api';
import { TRIPS_COPY } from '../trips-view-ui';
import type { TripData, TripRoutePoint } from '../trips.types';
import { useRequestGuard } from './useRequestGuard';

const ROUTE_CACHE_TTL_MS = 5 * 60 * 1000;
const ROUTE_POLL_INTERVAL_MS = 4000;

const routeCache = new Map<string, { fetchedAt: number; route: CanonicalTripRouteResponse }>();

function cacheKey(organizationId: string | undefined, vehicleId: string, tripId: string): string {
  return `${organizationId ?? 'org'}:${vehicleId}:${tripId}`;
}

function toRoutePoints(route: CanonicalTripRouteResponse | null): TripRoutePoint[] {
  if (!route) return [];
  return route.speedPoints.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
    speedKmh: point.speedKmh,
    timestamp: point.timestamp,
  }));
}

function shouldPollRoute(route: CanonicalTripRouteResponse): boolean {
  return (
    route.status.processingState === 'PROCESSING' ||
    route.status.processingState === 'RETRYING'
  );
}

export function shouldPollRouteForTesting(route: CanonicalTripRouteResponse): boolean {
  return shouldPollRoute(route);
}

export function buildRouteCacheKey(
  organizationId: string | undefined,
  vehicleId: string,
  tripId: string,
): string {
  return cacheKey(organizationId, vehicleId, tripId);
}

export function useTripRoute(vehicleId?: string, organizationId?: string) {
  const [route, setRoute] = useState<CanonicalTripRouteResponse | null>(null);
  const [routeTripId, setRouteTripId] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const routeGuard = useRequestGuard();
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTripIdRef = useRef<string | null>(null);
  const pollSeqRef = useRef<number | null>(null);

  const clearPoll = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    pollTripIdRef.current = null;
    pollSeqRef.current = null;
  }, []);

  const resetRoute = useCallback(() => {
    clearPoll();
    setRoute(null);
    setRouteTripId(null);
    setRouteLoading(false);
    setRouteError(null);
  }, [clearPoll]);

  const applyRoute = useCallback(
    (
      tripId: string,
      nextRoute: CanonicalTripRouteResponse,
      selectSeq: number,
      selectGuard: { isCurrent: (seq: number) => boolean },
    ) => {
      if (!selectGuard.isCurrent(selectSeq)) return;
      setRoute(nextRoute);
      setRouteTripId(tripId);
      if (vehicleId) {
        routeCache.set(cacheKey(organizationId, vehicleId, tripId), {
          fetchedAt: Date.now(),
          route: nextRoute,
        });
      }

      clearPoll();
      if (shouldPollRoute(nextRoute) && vehicleId) {
        pollTripIdRef.current = tripId;
        pollSeqRef.current = selectSeq;
        pollTimeoutRef.current = setTimeout(() => {
          void (async () => {
            if (
              pollTripIdRef.current !== tripId ||
              pollSeqRef.current !== selectSeq ||
              !selectGuard.isCurrent(selectSeq) ||
              !vehicleId
            ) {
              return;
            }
            try {
              const refreshed = await api.vehicleIntelligence.tripRoute(vehicleId, tripId);
              if (!selectGuard.isCurrent(selectSeq)) return;
              applyRoute(tripId, refreshed, selectSeq, selectGuard);
            } catch {
              if (selectGuard.isCurrent(selectSeq)) setRouteLoading(false);
            }
          })();
        }, ROUTE_POLL_INTERVAL_MS);
      }

      if (!nextRoute.status.ready) {
        setRouteError(null);
      } else if (!nextRoute.geometry?.coordinates.length) {
        setRouteError(TRIPS_COPY.routeUnavailable);
      } else {
        setRouteError(null);
      }
      if (selectGuard.isCurrent(selectSeq)) setRouteLoading(false);
    },
    [clearPoll, organizationId, vehicleId],
  );

  useEffect(() => () => clearPoll(), [clearPoll]);

  const loadRouteForTrip = useCallback(
    async (tripId: string, selectSeq: number, selectGuard: { isCurrent: (seq: number) => boolean }) => {
      if (!vehicleId) {
        setRouteLoading(false);
        return;
      }

      clearPoll();
      setRouteTripId(tripId);
      setRouteLoading(true);
      setRouteError(null);

      const cached = routeCache.get(cacheKey(organizationId, vehicleId, tripId));
      if (cached && Date.now() - cached.fetchedAt < ROUTE_CACHE_TTL_MS) {
        applyRoute(tripId, cached.route, selectSeq, selectGuard);
        return;
      }

      setRoute(null);
      try {
        const nextRoute = await api.vehicleIntelligence.tripRoute(vehicleId, tripId);
        applyRoute(tripId, nextRoute, selectSeq, selectGuard);
      } catch {
        if (!selectGuard.isCurrent(selectSeq)) return;
        setRoute(null);
        setRouteError(TRIPS_COPY.routeUnavailable);
        if (selectGuard.isCurrent(selectSeq)) setRouteLoading(false);
      }
    },
    [applyRoute, clearPoll, organizationId, vehicleId],
  );

  const reloadRoute = useCallback(
    async (trip: TripData) => {
      if (!vehicleId) return;
      const seq = routeGuard.next();
      routeCache.delete(cacheKey(organizationId, vehicleId, trip.id));
      setRouteTripId(trip.id);
      setRouteLoading(true);
      setRouteError(null);
      try {
        const nextRoute = await api.vehicleIntelligence.tripRoute(vehicleId, trip.id);
        applyRoute(trip.id, nextRoute, seq, routeGuard);
      } catch {
        if (!routeGuard.isCurrent(seq)) return;
        setRoute(null);
        setRouteError(TRIPS_COPY.routeUnavailable);
        if (routeGuard.isCurrent(seq)) setRouteLoading(false);
      }
    },
    [applyRoute, organizationId, routeGuard, vehicleId],
  );

  const isRouteForTrip = useCallback(
    (tripId: string | null) => tripId != null && routeTripId === tripId,
    [routeTripId],
  );

  const routePoints = toRoutePoints(route);
  const segments = route?.geometry?.coordinates ?? [];

  return {
    route,
    routePoints,
    segments,
    routeQuality: route?.routeQuality ?? null,
    processingState: route?.status.processingState ?? 'UNAVAILABLE',
    continuityStatus: route?.continuity.status ?? 'INSUFFICIENT_DATA',
    matchConfidence: route?.quality.matchConfidence ?? null,
    matchCoverage: route?.quality.matchCoverage ?? null,
    processedAt: route?.source.processedAt ?? null,
    routeTripId,
    routeLoading,
    routeError,
    resetRoute,
    loadRouteForTrip,
    reloadRoute,
    isRouteForTrip,
  };
}
