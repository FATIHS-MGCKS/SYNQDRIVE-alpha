import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type TireHealthSummaryResponse } from '../../lib/api';
import { useFleetVehicles } from '../../rental/FleetContext';
import {
  buildTireSetupOptions,
  resolveActiveTireSetup,
} from './operatorTireMeasurePayload';
import type { OperatorTireSetupOption } from './operatorTireMeasure.types';

export function useOperatorTireMeasureData(vehicleId: string) {
  const { fleetVehicles } = useFleetVehicles();
  const vehicle = useMemo(
    () => fleetVehicles.find((v) => v.id === vehicleId) ?? null,
    [fleetVehicles, vehicleId],
  );

  const [tiresRaw, setTiresRaw] = useState<unknown>(null);
  const [tireSummary, setTireSummary] = useState<TireHealthSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!vehicleId) return;
    setLoading(true);
    setError(null);
    try {
      const [tires, summary] = await Promise.all([
        api.vehicleIntelligence.tires(vehicleId).catch(() => []),
        api.vehicleIntelligence.tireHealthSummary(vehicleId).catch(() => null),
      ]);
      setTiresRaw(tires);
      setTireSummary(summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setupOptions: OperatorTireSetupOption[] = useMemo(
    () => buildTireSetupOptions(tiresRaw),
    [tiresRaw],
  );

  const activeSetup = useMemo(() => resolveActiveTireSetup(tiresRaw), [tiresRaw]);

  const odometerKm = useMemo(() => {
    if (vehicle?.odometerKm != null && Number.isFinite(vehicle.odometerKm) && vehicle.odometerKm > 0) {
      return vehicle.odometerKm;
    }
    if (vehicle?.odometer != null && Number.isFinite(vehicle.odometer) && vehicle.odometer > 0) {
      return vehicle.odometer;
    }
    return null;
  }, [vehicle]);

  return {
    vehicle,
    tireSummary,
    setupOptions,
    activeSetup,
    odometerKm,
    loading,
    error,
    reload,
  };
}
