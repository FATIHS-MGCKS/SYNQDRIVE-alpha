import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../../lib/api';
import type { FleetRentalHealthQuery, VehicleHealthResponse } from '../../lib/api';

interface UseVehicleHealthState {
  data: VehicleHealthResponse | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * V4.6.76 Rental Health V1 — single-vehicle health hook.
 *
 * Fetches the canonical 5-state VehicleHealth for one vehicle and caches
 * the result in local state. Re-fetches on vehicleId / orgId change and
 * exposes a `reload()` callback for "just did a pickup/return"-style
 * mutations that invalidate the gate (e.g. after a handover protocol).
 */
export function useVehicleHealth(
  orgId: string | null | undefined,
  vehicleId: string | null | undefined,
): UseVehicleHealthState {
  const [data, setData] = useState<VehicleHealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const load = useCallback(() => {
    if (!orgId || !vehicleId) {
      setData(null);
      setError(null);
      return;
    }
    cancelRef.current = false;
    setLoading(true);
    setError(null);
    api.rentalHealth
      .getVehicle(orgId, vehicleId)
      .then((res) => {
        if (cancelRef.current) return;
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelRef.current) return;
        setError(err?.message ?? 'Failed to load rental health');
        setLoading(false);
      });
  }, [orgId, vehicleId]);

  useEffect(() => {
    load();
    return () => {
      cancelRef.current = true;
    };
  }, [load]);

  return { data, loading, error, reload: load };
}

export interface UseFleetHealthMapOptions {
  /** Optional server-side filters (station scope is always applied server-side). */
  filters?: Omit<FleetRentalHealthQuery, 'limit' | 'cursor'>;
  /**
   * When true, uses the legacy `?vehicleIds=` endpoint (for compatibility only).
   * Default: scoped paginated fleet endpoint.
   */
  legacyVehicleIds?: string[];
}

/**
 * Fleet-wide health hook — returns a Map<vehicleId, VehicleHealthResponse>
 * so list views can do O(1) lookups on each row.
 *
 * Uses the scoped paginated fleet endpoint by default (no vehicleIds in URL).
 */
export function useFleetHealthMap(
  orgId: string | null | undefined,
  options: UseFleetHealthMapOptions = {},
): {
  map: Map<string, VehicleHealthResponse>;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [map, setMap] = useState<Map<string, VehicleHealthResponse>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const filtersKey = JSON.stringify(options.filters ?? {});
  const legacyKey = options.legacyVehicleIds?.slice().sort().join(',') ?? '';

  const load = useCallback(() => {
    if (!orgId) {
      setMap(new Map());
      setError(null);
      return;
    }
    cancelRef.current = false;
    setLoading(true);
    setError(null);

    const request =
      options.legacyVehicleIds && options.legacyVehicleIds.length > 0
        ? api.rentalHealth.getFleet(orgId, options.legacyVehicleIds).then((res) => ({
            vehicles: res.vehicles,
          }))
        : api.rentalHealth.getFleetScoped(orgId, options.filters);

    request
      .then((res) => {
        if (cancelRef.current) return;
        const next = new Map<string, VehicleHealthResponse>();
        for (const v of res.vehicles) next.set(v.vehicle_id, v);
        setMap(next);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelRef.current) return;
        setError(err?.message ?? 'Failed to load fleet health');
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, filtersKey, legacyKey]);

  useEffect(() => {
    load();
    return () => {
      cancelRef.current = true;
    };
  }, [load]);

  return { map, loading, error, reload: load };
}

/**
 * @deprecated Pass `{ legacyVehicleIds: vehicleIds }` to `useFleetHealthMap` instead.
 */
export function useFleetHealthMapLegacy(
  orgId: string | null | undefined,
  vehicleIds?: string[],
) {
  return useFleetHealthMap(orgId, { legacyVehicleIds: vehicleIds });
}
