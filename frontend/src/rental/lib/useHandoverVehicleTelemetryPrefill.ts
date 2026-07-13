import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import type { HandoverDialogKind } from '../components/handover/HandoverProtocolDialog';
import { useFleetVehicles } from '../FleetContext';
import type { VehicleData } from '../data/vehicles';
import {
  buildHandoverTelemetryPrefill,
  mapTelemetryApiToHandoverVehicle,
  resolveVehicleOdometerKm,
  type HandoverTelemetryPrefill,
  type HandoverVehicleTelemetryLike,
} from './handoverVehicleTelemetry';

export function useHandoverVehicleTelemetryPrefill(
  isOpen: boolean,
  orgId: string,
  vehicleId: string | undefined,
  kind: HandoverDialogKind,
  pickupOdometerKm?: number | null,
): { prefill: HandoverTelemetryPrefill; vehicle: HandoverVehicleTelemetryLike | null; loading: boolean } {
  const { fleetVehicles } = useFleetVehicles();
  const fleetVehicle = useMemo(
    () => (vehicleId ? fleetVehicles.find((v) => v.id === vehicleId) ?? null : null),
    [fleetVehicles, vehicleId],
  );
  const [telemetryVehicle, setTelemetryVehicle] = useState<HandoverVehicleTelemetryLike | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !orgId || !vehicleId) {
      setTelemetryVehicle(null);
      setLoading(false);
      return;
    }

    if (fleetVehicle && resolveVehicleOdometerKm(fleetVehicle) != null) {
      setTelemetryVehicle(fleetVehicle);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    api.vehicles
      .telemetry(orgId, vehicleId)
      .then((row) => {
        if (cancelled) return;
        setTelemetryVehicle(mapTelemetryApiToHandoverVehicle(row as Record<string, unknown>, fleetVehicle));
      })
      .catch(() => {
        if (!cancelled) setTelemetryVehicle(fleetVehicle);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, orgId, vehicleId, fleetVehicle]);

  const vehicle = telemetryVehicle ?? fleetVehicle;

  const prefill = useMemo(
    () =>
      buildHandoverTelemetryPrefill({
        kind,
        vehicle,
        pickupOdometerKm,
      }),
    [kind, vehicle, pickupOdometerKm],
  );

  return { prefill, vehicle, loading };
}

export function fleetVehicleToTelemetryLike(vehicle: VehicleData | null): HandoverVehicleTelemetryLike | null {
  if (!vehicle) return null;
  return {
    isElectric: vehicle.isElectric,
    odometerKm: vehicle.odometerKm,
    odometer: vehicle.odometer,
    fuelPercent: vehicle.fuelPercent,
    evSoc: vehicle.evSoc,
    fuel: vehicle.fuel,
  };
}
