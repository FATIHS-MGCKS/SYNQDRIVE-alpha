import {
  observationFreshnessIsDecisionFresh,
  type ObservationFreshness,
} from './battery-freshness.policy';

/** Minimal summary slice for HV compat endpoint assembly (no legacy telemetry bypass). */
export type HvBatteryStatusCompatSummaryInput = {
  hv: {
    sohPct?: number | null;
    healthPercent?: number | null;
    method?: string | null;
    sohSource?: string | null;
    publicationState?: string | null;
    confidence?: string | null;
    snapshotCount?: number | null;
    freshness?: { observedAt?: string | null } | null;
    telemetry?: {
      socPercent?: number | null;
      rangeKm?: number | null;
      grossCapacityKwh?: number | null;
      temperatureC?: number | null;
      chargingPowerKw?: number | null;
      isCharging?: boolean | null;
      chargingCableConnected?: boolean | null;
      currentVoltageV?: number | null;
      currentEnergyKwh?: number | null;
      addedEnergyKwh?: number | null;
      providerSohPercent?: number | null;
    } | null;
  } | null;
  canonical?: {
    hv?: { referenceCapacity?: { capacityKwh?: number | null } | null } | null;
  } | null;
  currentTelemetry?: {
    socPercent?: number | null;
    rangeKm?: number | null;
    observationFreshness?: ObservationFreshness | null;
  } | null;
};

export type HvBatteryStatusLegacyDiagnostic = Record<string, unknown> | null;

export function hvTelemetryObservationIsDecisionFresh(
  summary: HvBatteryStatusCompatSummaryInput,
): boolean {
  const freshness = summary.currentTelemetry?.observationFreshness;
  if (!freshness) return false;
  return observationFreshnessIsDecisionFresh(freshness);
}

/**
 * Customer-facing HV compat fields: canonical/summary truth only.
 * Legacy service output is exposed only under `legacy` for diagnostics.
 */
export function presentHvBatteryStatusCompatResponse(
  summary: HvBatteryStatusCompatSummaryInput,
  legacy: HvBatteryStatusLegacyDiagnostic,
) {
  const hv = summary.hv;
  const canonicalHv = summary.canonical?.hv ?? null;
  const telemetryFresh = hvTelemetryObservationIsDecisionFresh(summary);

  const customerSoc =
    summary.currentTelemetry?.socPercent ?? hv?.telemetry?.socPercent ?? null;
  const customerRange = telemetryFresh
    ? summary.currentTelemetry?.rangeKm ?? hv?.telemetry?.rangeKm ?? null
    : null;

  const customerSoh = hv?.sohPct ?? hv?.healthPercent ?? null;

  const customerTelemetry = telemetryFresh && hv?.telemetry ? hv.telemetry : null;

  const nominalCapacityKwh =
    canonicalHv?.referenceCapacity?.capacityKwh ??
    (legacy?.nominalCapacityKwh as number | null | undefined) ??
    hv?.telemetry?.grossCapacityKwh ??
    null;

  return {
    _compat: true as const,
    _canonical: 'Prefer battery-health-summary.canonical.hv for new consumers.',
    isEv: true as const,
    nominalCapacityKwh,
    currentSocPercent: customerSoc,
    estimatedRangeKm: customerRange,
    sohPercent: customerSoh,
    publishedSohPercent: customerSoh,
    sohMethod: hv?.method ?? 'canonical',
    sohSourceType: hv?.sohSource ?? null,
    publicationState: hv?.publicationState ?? null,
    maturityConfidence: hv?.confidence ?? null,
    snapshotCount: hv?.snapshotCount ?? 0,
    telemetry: customerTelemetry,
    lastRecordedAt: telemetryFresh
      ? hv?.freshness?.observedAt ?? null
      : summary.currentTelemetry?.observationFreshness?.observedAt ?? null,
    canonical: canonicalHv,
    canonicalSummary: hv,
    currentTelemetry: summary.currentTelemetry ?? null,
    legacy: legacy ?? undefined,
  };
}
