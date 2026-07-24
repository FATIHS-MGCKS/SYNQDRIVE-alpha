import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type {
  BrakeHealthSummary,
  DashboardWarningLightsResponse,
  ServiceInfoStatus,
  TireHealthSummaryResponse,
  VehicleHealthTabSummaryDto,
} from '../../../lib/api';
import { useBatteryHealthQuery } from '../../lib/battery-health-query';
import type { DtcLoadState } from './vehicle-health-box.mapper';

export interface VehicleHealthBoxData {
  tires: TireHealthSummaryResponse | null;
  brakes: BrakeHealthSummary | null;
  battery: ReturnType<typeof useBatteryHealthQuery<'summary'>>['data'];
  batteryError: string | null;
  batteryRetry: () => Promise<void>;
  batteryLoading: boolean;
  batteryIsLiveStale: boolean;
  service: ServiceInfoStatus | null;
  dtcCount: number | null;
  dtcLoadState: DtcLoadState;
  dashboardLights: DashboardWarningLightsResponse | null;
  dashboardLightsLoading: boolean;
  healthTabSummary: VehicleHealthTabSummaryDto | null;
  detailLoading: boolean;
}

const INITIAL_OMIT_BATTERY = {
  tires: null as TireHealthSummaryResponse | null,
  brakes: null as BrakeHealthSummary | null,
  service: null as ServiceInfoStatus | null,
  dtcCount: null as number | null,
  dtcLoadState: 'idle' as DtcLoadState,
  dashboardLights: null as DashboardWarningLightsResponse | null,
  dashboardLightsLoading: false,
  healthTabSummary: null as VehicleHealthTabSummaryDto | null,
  detailLoading: false,
};

export function useVehicleHealthBoxData(
  vehicleId: string | null,
  orgId: string | null | undefined,
  options?: { livePolling?: boolean },
): VehicleHealthBoxData {
  const batteryQuery = useBatteryHealthQuery({
    orgId,
    vehicleId,
    variant: 'summary',
    livePolling: options?.livePolling ?? Boolean(vehicleId && orgId),
  });

  const [rest, setRest] = useState(INITIAL_OMIT_BATTERY);

  useEffect(() => {
    if (!vehicleId) {
      setRest(INITIAL_OMIT_BATTERY);
      return;
    }

    let cancelled = false;
    setRest((prev) => ({
      ...prev,
      dtcLoadState: 'loading',
      dashboardLightsLoading: true,
      detailLoading: true,
    }));

    (async () => {
      const [tires, brakes, service, dtcResult, dashboardLights, healthTabSummary] =
        await Promise.all([
          api.vehicleIntelligence.tireHealthSummary(vehicleId).catch(() => null),
          api.vehicleIntelligence.brakeHealthSummary(vehicleId).catch(() => null),
          api.vehicleIntelligence.serviceInfoStatus(vehicleId).catch(() => null),
          api.vehicleIntelligence
            .dtcActive(vehicleId)
            .then((rows) => ({ ok: true as const, count: Array.isArray(rows) ? rows.length : 0 }))
            .catch(() => ({ ok: false as const, count: null })),
          api.vehicleIntelligence.dashboardWarningLights(vehicleId).catch(() => null),
          api.vehicleIntelligence.healthTabSummary(vehicleId).catch(() => null),
        ]);

      if (cancelled) return;

      setRest({
        tires,
        brakes,
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

  return {
    ...rest,
    battery: batteryQuery.data,
    batteryError: batteryQuery.error,
    batteryRetry: batteryQuery.retry,
    batteryLoading: batteryQuery.loading,
    batteryIsLiveStale: batteryQuery.isLiveStale,
  };
}
