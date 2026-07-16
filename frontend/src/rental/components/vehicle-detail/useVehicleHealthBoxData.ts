import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type {
  BatteryHealthSummary,
  BrakeHealthSummary,
  DashboardWarningLightsResponse,
  ServiceInfoStatus,
  TireHealthSummaryResponse,
  VehicleHealthTabSummaryDto,
} from '../../../lib/api';
import type { DtcLoadState } from './vehicle-health-box.mapper';

export interface VehicleHealthBoxData {
  tires: TireHealthSummaryResponse | null;
  brakes: BrakeHealthSummary | null;
  battery: BatteryHealthSummary | null;
  batteryLoadError: boolean;
  service: ServiceInfoStatus | null;
  dtcCount: number | null;
  dtcLoadState: DtcLoadState;
  dashboardLights: DashboardWarningLightsResponse | null;
  dashboardLightsLoading: boolean;
  healthTabSummary: VehicleHealthTabSummaryDto | null;
  detailLoading: boolean;
}

const INITIAL: VehicleHealthBoxData = {
  tires: null,
  brakes: null,
  battery: null,
  batteryLoadError: false,
  service: null,
  dtcCount: null,
  dtcLoadState: 'idle',
  dashboardLights: null,
  dashboardLightsLoading: false,
  healthTabSummary: null,
  detailLoading: false,
};

export function useVehicleHealthBoxData(vehicleId: string | null): VehicleHealthBoxData {
  const [data, setData] = useState<VehicleHealthBoxData>(INITIAL);

  useEffect(() => {
    if (!vehicleId) {
      setData(INITIAL);
      return;
    }

    let cancelled = false;
    setData((prev) => ({
      ...prev,
      dtcLoadState: 'loading',
      dashboardLightsLoading: true,
      detailLoading: true,
    }));

    (async () => {
      const [tires, brakes, batteryResult, service, dtcResult, dashboardLights, healthTabSummary] =
        await Promise.all([
          api.vehicleIntelligence.tireHealthSummary(vehicleId).catch(() => null),
          api.vehicleIntelligence.brakeHealthSummary(vehicleId).catch(() => null),
          api.vehicleIntelligence
            .batteryHealthSummary(vehicleId)
            .then((battery) => ({ ok: true as const, battery }))
            .catch(() => ({ ok: false as const, battery: null })),
          api.vehicleIntelligence.serviceInfoStatus(vehicleId).catch(() => null),
          api.vehicleIntelligence
            .dtcActive(vehicleId)
            .then((rows) => ({ ok: true as const, count: Array.isArray(rows) ? rows.length : 0 }))
            .catch(() => ({ ok: false as const, count: null })),
          api.vehicleIntelligence.dashboardWarningLights(vehicleId).catch(() => null),
          api.vehicleIntelligence.healthTabSummary(vehicleId).catch(() => null),
        ]);

      if (cancelled) return;

      setData({
        tires,
        brakes,
        battery: batteryResult.battery,
        batteryLoadError: !batteryResult.ok,
        service,
        dtcCount: dtcResult.ok ? dtcResult.count : null,
        dtcLoadState: dtcResult.ok ? 'loaded' : 'error',
        dashboardLights,
        dashboardLightsLoading: false,
        healthTabSummary,
        detailLoading: false,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [vehicleId]);

  return data;
}
