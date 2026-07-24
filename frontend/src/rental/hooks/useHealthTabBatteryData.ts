import { useMemo } from 'react';
import type { BatteryHealthDetail, BatteryHealthSummary, HvBatteryStatus } from '../../lib/api';
import {
  deriveHvBatteryStatusFromDetail,
  useBatteryHealthQuery,
} from '../lib/battery-health-query';
import { useDocumentVisible } from './useBrowserTabSignals';

export function useHealthTabBatteryData(input: {
  orgId: string | null | undefined;
  vehicleId: string | null | undefined;
  isEv: boolean;
  enabled?: boolean;
}) {
  const { orgId, vehicleId, isEv, enabled = true } = input;
  const isDocumentVisible = useDocumentVisible();

  const query = useBatteryHealthQuery({
    orgId,
    vehicleId,
    variant: 'detail',
    enabled,
    livePolling: enabled && isDocumentVisible,
  });

  const detail = query.data;
  const summary = (detail as BatteryHealthSummary | null) ?? null;

  const hvBatteryStatus = useMemo<HvBatteryStatus | null>(
    () => deriveHvBatteryStatusFromDetail(detail, isEv),
    [detail, isEv],
  );

  const batteryLatest = detail?.currentState ?? null;

  return {
    batterySummary: summary as BatteryHealthSummary | null,
    batteryDetail: detail as BatteryHealthDetail | null,
    batteryLatest,
    hvBatteryStatus,
    batteryError: query.error,
    batteryLoading: query.loading,
    batteryIsLiveStale: query.isLiveStale,
    batteryIsHealthStale: query.isHealthStale,
    reloadBattery: query.reload,
    retryBattery: query.retry,
    canonical: query.canonical,
  };
}
