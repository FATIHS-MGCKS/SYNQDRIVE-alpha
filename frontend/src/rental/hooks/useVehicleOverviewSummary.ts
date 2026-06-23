import { useShallow } from 'zustand/react/shallow';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { ApiTask, VehicleTripAnalytics } from '../../lib/api';
import { useEffectiveHealth } from '../FleetContext';
import type { VehicleData } from '../data/vehicles';
import { unwrapBookingListResponse } from '../components/bookings/bookingUtils';
import { parseVehicleTaskList } from '../lib/task-display.utils';
import type { DamageStatsResponse } from '../lib/damage.types';
import type { VehicleFileSummary } from '../lib/vehicle-file-summary.types';
import {
  buildOverviewBookingsQueryRange,
  buildVehicleOverviewSummary,
  parseVehicleBookingOperatorList,
} from '../lib/vehicle-overview-summary.utils';
import {
  buildTodayTripsQueryRange,
  parseOverviewTripList,
} from '../lib/vehicle-overview-cards.utils';
import type { VehicleOverviewSummary } from '../lib/vehicle-overview.types';
import { useVehicleLiveMapStore } from '../stores/useVehicleLiveMapStore';
import { deriveLocationOverviewSnapshot } from '../lib/vehicle-overview-summary.utils';

export interface UseVehicleOverviewSummaryOptions {
  orgId: string | null | undefined;
  vehicle: VehicleData | null;
  /** Bump to refetch tasks (mirrors `tasksRefreshToken` in App.tsx). */
  tasksRefreshToken?: number;
  enabled?: boolean;
}

export interface UseVehicleOverviewSummaryResult {
  summary: VehicleOverviewSummary;
  reload: () => void;
}

interface OverviewFetchPayload {
  bookings: ReturnType<typeof parseVehicleBookingOperatorList>;
  tasks: ReturnType<typeof parseVehicleTaskList>;
  rawTasks: ApiTask[];
  damageStats: DamageStatsResponse | null;
  fileSummary: VehicleFileSummary | null;
  tripStats: Awaited<ReturnType<typeof api.vehicleIntelligence.tripStats>> | null;
  todayTrips: VehicleTripAnalytics[];
}

const EMPTY_PAYLOAD: OverviewFetchPayload = {
  bookings: [],
  tasks: [],
  rawTasks: [],
  damageStats: null,
  fileSummary: null,
  tripStats: null,
  todayTrips: [],
};

/**
 * Frontend-only view model for the Overview quick cards + readiness strip.
 * Reuses existing APIs only — no new backend truth.
 */
export function useVehicleOverviewSummary(
  options: UseVehicleOverviewSummaryOptions,
): UseVehicleOverviewSummaryResult {
  const { orgId, vehicle, tasksRefreshToken = 0, enabled = true } = options;
  const vehicleId = vehicle?.id ?? null;

  const { status: effectiveStatus, health, loading: healthLoading } = useEffectiveHealth(vehicleId);

  const {
    boundVehicleId,
    displayState,
    onlineStatus,
    lastSignal,
    hasPosition,
  } = useVehicleLiveMapStore(
    useShallow((state) => ({
      boundVehicleId: state.boundVehicleId,
      displayState: state.displayState,
      onlineStatus: state.onlineStatus,
      lastSignal: state.lastSignal,
      hasPosition: state.targetPosition != null || state.lastConfirmedPosition != null,
    })),
  );

  const liveMap = useMemo(
    () => ({
      displayState,
      onlineStatus,
      lastSignal,
      hasPosition,
    }),
    [displayState, onlineStatus, lastSignal, hasPosition],
  );

  const locationSnapshot = useMemo(() => {
    if (!vehicleId || boundVehicleId !== vehicleId) {
      return deriveLocationOverviewSnapshot(undefined);
    }
    return deriveLocationOverviewSnapshot(liveMap);
  }, [vehicleId, boundVehicleId, liveMap]);

  const [reloadToken, setReloadToken] = useState(0);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState(false);
  const [damagesLoading, setDamagesLoading] = useState(false);
  const [damagesError, setDamagesError] = useState(false);
  const [damagesUnavailable, setDamagesUnavailable] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState(false);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [tripsError, setTripsError] = useState(false);
  const [tripsUnavailable, setTripsUnavailable] = useState(false);

  const [payload, setPayload] = useState<OverviewFetchPayload>(EMPTY_PAYLOAD);
  const activeVehicleIdRef = useRef<string | null>(vehicleId);
  activeVehicleIdRef.current = vehicleId;

  useEffect(() => {
    if (!enabled || !vehicleId) {
      setPayload(EMPTY_PAYLOAD);
      setBookingsLoading(false);
      setTasksLoading(false);
      setDamagesLoading(false);
      setDocumentsLoading(false);
      setTripsLoading(false);
      return;
    }

    let cancelled = false;
    const fetchVehicleId = vehicleId;
    const bookingRange = buildOverviewBookingsQueryRange();
    const todayRange = buildTodayTripsQueryRange();

    setPayload(EMPTY_PAYLOAD);
    setBookingsLoading(true);
    setTasksLoading(true);
    setDamagesLoading(true);
    setDocumentsLoading(true);
    setTripsLoading(true);
    setBookingsError(false);
    setTasksError(false);
    setDamagesError(false);
    setDocumentsError(false);
    setTripsError(false);
    setDamagesUnavailable(false);
    setTripsUnavailable(false);

    const bookingsPromise =
      orgId != null
        ? api.bookings
            .list(orgId, {
              vehicleId,
              from: bookingRange.from,
              to: bookingRange.to,
              limit: 200,
            })
            .then((res) => parseVehicleBookingOperatorList(unwrapBookingListResponse(res)))
            .catch(() => {
              if (!cancelled) setBookingsError(true);
              return [];
            })
        : Promise.resolve([]);

    const tasksPromise =
      orgId != null
        ? api.tasks
            .forVehicle(orgId, vehicleId)
            .then((rows) => rows as ApiTask[])
            .catch(() => {
              if (!cancelled) setTasksError(true);
              return [] as ApiTask[];
            })
        : Promise.resolve([] as ApiTask[]);

    const damagesPromise = api.vehicleIntelligence.getDamageStats(vehicleId).catch(() => {
      if (!cancelled) {
        setDamagesError(true);
        setDamagesUnavailable(true);
      }
      return null;
    });

    const documentsPromise = api.vehicleIntelligence.vehicleFileSummary(vehicleId).catch(() => {
      if (!cancelled) setDocumentsError(true);
      return null;
    });

    const tripStatsPromise = api.vehicleIntelligence.tripStats(vehicleId).catch(() => {
      if (!cancelled) {
        setTripsError(true);
        setTripsUnavailable(true);
      }
      return null;
    });

    const todayTripsPromise = api.vehicleIntelligence
      .trips(vehicleId, { from: todayRange.from, to: todayRange.to })
      .then((rows) => parseOverviewTripList(rows))
      .catch(() => {
        if (!cancelled) setTripsError(true);
        return [] as VehicleTripAnalytics[];
      });

    Promise.all([
      bookingsPromise,
      tasksPromise,
      damagesPromise,
      documentsPromise,
      tripStatsPromise,
      todayTripsPromise,
    ])
      .then(([bookings, rawTasks, damageStats, fileSummary, tripStats, todayTrips]) => {
        if (cancelled || activeVehicleIdRef.current !== fetchVehicleId) return;
        setPayload({
          bookings,
          tasks: parseVehicleTaskList(rawTasks),
          rawTasks,
          damageStats,
          fileSummary,
          tripStats,
          todayTrips,
        });
      })
      .finally(() => {
        if (cancelled || activeVehicleIdRef.current !== fetchVehicleId) return;
        setBookingsLoading(false);
        setTasksLoading(false);
        setDamagesLoading(false);
        setDocumentsLoading(false);
        setTripsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, orgId, vehicleId, tasksRefreshToken, reloadToken]);

  const summary = useMemo(
    () =>
      buildVehicleOverviewSummary({
        vehicle,
        effectiveStatus,
        healthLoading,
        rentalBlocked: health?.rental_blocked === true,
        blockingReasons: health?.blocking_reasons ?? [],
        location: locationSnapshot,
        bookings: payload.bookings,
        bookingsLoading,
        bookingsError,
        tasks: payload.tasks,
        rawTasks: payload.rawTasks,
        tasksLoading,
        tasksError,
        damageStats: payload.damageStats,
        damagesLoading,
        damagesError,
        damagesUnavailable,
        fileSummary: payload.fileSummary,
        documentsLoading,
        documentsError,
        todayTrips: payload.todayTrips,
        tripStats: payload.tripStats,
        tripsLoading,
        tripsError,
        tripsUnavailable,
      }),
    [
      vehicle,
      effectiveStatus,
      healthLoading,
      health?.rental_blocked,
      health?.blocking_reasons,
      locationSnapshot,
      payload,
      bookingsLoading,
      bookingsError,
      tasksLoading,
      tasksError,
      damagesLoading,
      damagesError,
      damagesUnavailable,
      documentsLoading,
      documentsError,
      tripsLoading,
      tripsError,
      tripsUnavailable,
    ],
  );

  return {
    summary,
    reload: () => setReloadToken((value) => value + 1),
  };
}
