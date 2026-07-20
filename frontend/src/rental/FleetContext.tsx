import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { VehicleHealthResponse } from '../lib/api';
import { useRentalOrg } from './RentalContext';
import { useFleetHealthMap } from './hooks/useVehicleHealth';
import type { VehicleData } from './data/vehicles';
import {
  dashboardStationIdToFilter,
  readPersistedDashboardStationId,
} from './lib/fleet-station-filter';
import {
  FLEET_MAP_REFRESH_MS,
  useFleetMapStore,
} from './stores/useFleetMapStore';
import {
  registerVehicleOperationalInvalidationHandler,
  vehicleOperationalQueryKeys,
} from './lib/vehicle-operational-query';

export type EffectiveHealthStatus = 'Critical' | 'Warning' | 'Good Health' | 'Unknown';

export function statusFromRentalHealth(
  state: import('../lib/api').RentalHealthState | undefined,
): EffectiveHealthStatus {
  if (state === 'critical') return 'Critical';
  if (state === 'warning') return 'Warning';
  if (state === 'good') return 'Good Health';
  return 'Unknown';
}

interface FleetContextValue {
  fleetVehicles: VehicleData[];
  loading: boolean;
  refresh: () => Promise<void>;
  /** Seconds until next automatic refresh (0–30). */
  countdown: number;
  /**
   * V4.7.23 — Canonical Rental-Health-V1 map keyed by vehicleId.
   */
  healthMap: Map<string, VehicleHealthResponse>;
  healthLoading: boolean;
  healthError: string | null;
  healthFetchedAt: string | null;
  reloadHealth: () => Promise<void>;
}

const FleetCtx = createContext<FleetContextValue>({
  fleetVehicles: [],
  loading: true,
  refresh: async () => {},
  countdown: 30,
  healthMap: new Map(),
  healthLoading: false,
  healthError: null,
  healthFetchedAt: null,
  reloadHealth: async () => {},
});

export function FleetProvider({ children }: { children: ReactNode }) {
  const { orgId } = useRentalOrg();
  const fleetVehicles = useFleetMapStore((state) => state.vehicles);
  const loading = useFleetMapStore((state) => state.loading);
  const lastFetchedAt = useFleetMapStore((state) => state.lastFetchedAt);
  const fetchFleetMap = useFleetMapStore((state) => state.fetchFleetMap);
  const setStationFilter = useFleetMapStore((state) => state.setStationFilter);
  const stationHydratedRef = useRef(false);

  const [countdown, setCountdown] = useState(Math.ceil(FLEET_MAP_REFRESH_MS / 1000));
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fleetVehicleIds = useMemo(() => fleetVehicles.map((v) => v.id), [fleetVehicles]);
  const { map: healthMap, loading: healthLoading, error: healthError, fetchedAt: healthFetchedAt, reload: reloadHealth } =
    useFleetHealthMap(orgId, fleetVehicleIds);

  const refresh = useMemo(
    () => async () => {
      if (!orgId) return;
      await fetchFleetMap(orgId);
    },
    [fetchFleetMap, orgId],
  );

  useEffect(() => {
    if (!orgId) return;

    const unregisterFleet = registerVehicleOperationalInvalidationHandler(
      vehicleOperationalQueryKeys.fleetMap(orgId),
      async () => {
        await fetchFleetMap(orgId);
      },
    );

    const unregisterHealth = registerVehicleOperationalInvalidationHandler(
      vehicleOperationalQueryKeys.fleetHealth(orgId),
      () => {
        reloadHealth();
      },
    );

    return () => {
      unregisterFleet();
      unregisterHealth();
    };
  }, [orgId, fetchFleetMap, reloadHealth]);

  useEffect(() => {
    if (stationHydratedRef.current) return;
    stationHydratedRef.current = true;
    const persisted = readPersistedDashboardStationId();
    if (persisted) {
      setStationFilter(dashboardStationIdToFilter(persisted));
    }
  }, [setStationFilter]);

  useEffect(() => {
    if (!orgId) return;
    void fetchFleetMap(orgId);
  }, [orgId, fetchFleetMap]);

  useEffect(() => {
    if (!orgId) return;

    const tick = () => {
      if (document.visibilityState === 'visible') void fetchFleetMap(orgId);
    };

    refreshIntervalRef.current = setInterval(tick, FLEET_MAP_REFRESH_MS);
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [orgId, fetchFleetMap]);

  useEffect(() => {
    countdownIntervalRef.current = setInterval(() => {
      if (!lastFetchedAt) {
        setCountdown(Math.ceil(FLEET_MAP_REFRESH_MS / 1000));
        return;
      }
      const elapsed = Date.now() - lastFetchedAt;
      setCountdown(Math.max(0, Math.ceil((FLEET_MAP_REFRESH_MS - elapsed) / 1000)));
    }, 1000);
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [lastFetchedAt]);

  return (
    <FleetCtx.Provider
      value={{
        fleetVehicles,
        loading,
        refresh,
        countdown,
        healthMap,
        healthLoading,
        healthError,
        healthFetchedAt,
        reloadHealth,
      }}
    >
      {children}
    </FleetCtx.Provider>
  );
}

export function useFleetVehicles() {
  return useContext(FleetCtx);
}

/**
 * Canonical per-vehicle health hook — reads the shared FleetProvider map.
 */
export function useEffectiveHealth(vehicleId: string | null | undefined): {
  status: EffectiveHealthStatus;
  health: VehicleHealthResponse | null;
  loading: boolean;
} {
  const { healthMap, healthLoading } = useContext(FleetCtx);
  if (!vehicleId) return { status: 'Unknown', health: null, loading: healthLoading };
  const health = healthMap.get(vehicleId) ?? null;
  return {
    status: statusFromRentalHealth(health?.overall_state),
    health,
    loading: healthLoading,
  };
}
