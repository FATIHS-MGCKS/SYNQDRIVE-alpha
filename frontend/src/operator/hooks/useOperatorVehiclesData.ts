import { useMemo } from 'react';
import { useFleetVehicles } from '../../rental/FleetContext';
import type { VehicleData } from '../../rental/data/vehicles';

export function useOperatorVehiclesData(searchQuery = '') {
  const { fleetVehicles, loading, healthMap, refresh, healthLoading, healthError } = useFleetVehicles();

  const vehicles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return fleetVehicles;
    return fleetVehicles.filter((v) => matchesVehicle(v, q));
  }, [fleetVehicles, searchQuery]);

  const vehicleById = useMemo(() => {
    const map = new Map<string, VehicleData>();
    for (const v of fleetVehicles) map.set(v.id, v);
    return map;
  }, [fleetVehicles]);

  return {
    vehicles,
    allVehicles: fleetVehicles,
    vehicleById,
    healthMap,
    loading: loading || healthLoading,
    healthLoading,
    healthError,
    refresh,
  };
}

function matchesVehicle(v: VehicleData, q: string): boolean {
  const hay = [v.license, v.model, v.make, v.station, v.id].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}
