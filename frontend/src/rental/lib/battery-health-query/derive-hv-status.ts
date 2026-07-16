import type { BatteryHealthDetail, BatteryHealthSummary, HvBatteryStatus } from '../../../lib/api';

export function deriveHvBatteryStatusFromDetail(
  detail: BatteryHealthDetail | null | undefined,
  isEv: boolean,
): HvBatteryStatus | null {
  if (!detail?.support?.hv || !isEv) return null;

  return {
    isEv: true,
    nominalCapacityKwh: detail.hv?.telemetry?.grossCapacityKwh ?? null,
    currentSocPercent: detail.hv?.telemetry?.socPercent ?? null,
    estimatedRangeKm: detail.hv?.telemetry?.rangeKm ?? null,
    sohPercent: detail.hv?.healthPercent ?? null,
    rawSohPercent: detail.hv?.healthPercent ?? null,
    publishedSohPercent: detail.hv?.healthPercent ?? null,
    providerReportedSohPercent: detail.hv?.telemetry?.providerSohPercent ?? null,
    sohMethod: detail.hv?.method ?? 'estimate_unavailable',
    sohSourceType: detail.hv?.evidenceType ?? null,
    publicationState: detail.hv?.publicationState ?? 'INITIAL_CALIBRATION',
    publicationMethod: detail.hv?.method ?? 'estimate_unavailable',
    maturityConfidence: detail.hv?.confidence ?? 'none',
    validEstimateCount: 0,
    sohInterpretation: detail.hv?.interpretation ?? {
      label: 'Unknown',
      color: 'gray',
      description: 'Insufficient data.',
    },
    estimatedCurrentCapacityKwh: null,
    snapshotCount: detail.hv?.snapshotCount ?? 0,
    chargingSessions: detail.detail?.hv?.chargingSessions ?? [],
    recentTrend: detail.detail?.hv?.recentTrend ?? [],
    lastRecordedAt: detail.hv?.freshness?.observedAt ?? null,
    telemetry: {
      temperatureC: detail.hv?.telemetry?.temperatureC ?? null,
      chargingPowerKw: detail.hv?.telemetry?.chargingPowerKw ?? null,
      isCharging: detail.hv?.telemetry?.isCharging ?? null,
      chargingCableConnected: detail.hv?.telemetry?.chargingCableConnected ?? null,
      currentVoltageV: detail.hv?.telemetry?.currentVoltageV ?? null,
      currentEnergyKwh: detail.hv?.telemetry?.currentEnergyKwh ?? null,
      addedEnergyKwh: detail.hv?.telemetry?.addedEnergyKwh ?? null,
    },
    providerSohObservedAt: detail.hv?.freshness?.observedAt ?? null,
    canonical: detail.hv ?? null,
    currentTelemetry: detail.currentTelemetry,
  };
}

export type BatteryHealthSummaryState = BatteryHealthSummary | null;
export type BatteryHealthDetailState = BatteryHealthDetail | null;
