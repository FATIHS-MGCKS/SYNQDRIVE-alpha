import {
  observationFreshnessIsDecisionFresh,
  type ObservationFreshness,
} from './battery-freshness.policy';
import {
  type HvCustomerTelemetryFields,
  presentHvCustomerTelemetryFields,
  resolveCustomerHvNominalCapacityKwh,
} from './battery-hv-customer-telemetry.presenter';
import type { CanonicalBatteryDto } from './canonical-battery/canonical-battery.types';
import { maskCanonicalHvCustomerSurfaces } from './battery-customer-response.presenter';

type HvCompatCanonicalHvSlice = {
  referenceCapacity?: {
    capacityKwh?: number | null;
    verificationStatus?: string | null;
  } | null;
  providerSoh?: {
    percent?: number | null;
    decisionFresh?: boolean;
  } | null;
  soc?: { percent?: number | null };
  currentEnergy?: { kwh?: number | null };
  chargingState?: Record<string, unknown> | null;
};

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
  canonical?: CanonicalBatteryDto | { hv?: HvCompatCanonicalHvSlice | null } | null;
  currentTelemetry?: {
    socPercent?: number | null;
    rangeKm?: number | null;
    genericEnergyPercent?: number | null;
    chargingPowerKw?: number | null;
    chargingState?: string | null;
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

export function hvProviderSohObservationIsDecisionFresh(
  summary: HvBatteryStatusCompatSummaryInput,
): boolean {
  const decisionFresh = summary.canonical?.hv?.providerSoh?.decisionFresh;
  if (decisionFresh === true) return true;
  if (decisionFresh === false) return false;
  return false;
}

function buildCompatCustomerTelemetry(
  summary: HvBatteryStatusCompatSummaryInput,
): HvCustomerTelemetryFields | null {
  const hvTelemetry = summary.hv?.telemetry;
  if (!hvTelemetry) return null;

  const carrierObservationFresh = hvTelemetryObservationIsDecisionFresh(summary);
  const providerSohObservationFresh = hvProviderSohObservationIsDecisionFresh(summary);

  return presentHvCustomerTelemetryFields({
    raw: {
      socPercent: hvTelemetry.socPercent ?? null,
      rangeKm: hvTelemetry.rangeKm ?? null,
      currentEnergyKwh: hvTelemetry.currentEnergyKwh ?? null,
      grossCapacityKwhFromTelemetry: hvTelemetry.grossCapacityKwh ?? null,
      addedEnergyKwh: hvTelemetry.addedEnergyKwh ?? null,
      chargingPowerKw: hvTelemetry.chargingPowerKw ?? null,
      currentVoltageV: hvTelemetry.currentVoltageV ?? null,
      temperatureC: hvTelemetry.temperatureC ?? null,
      isCharging: hvTelemetry.isCharging ?? null,
      chargingCableConnected: hvTelemetry.chargingCableConnected ?? null,
      providerSohPercent: hvTelemetry.providerSohPercent ?? null,
    },
    carrierObservationFresh,
    providerSohObservationFresh,
  });
}

function presentCompatSanitizedCurrentTelemetry(
  currentTelemetry: HvBatteryStatusCompatSummaryInput['currentTelemetry'],
  customerTelemetry: HvCustomerTelemetryFields | null,
) {
  if (!currentTelemetry) return null;
  return {
    ...currentTelemetry,
    socPercent: customerTelemetry?.socPercent ?? null,
    rangeKm: customerTelemetry?.rangeKm ?? null,
    genericEnergyPercent: customerTelemetry?.socPercent ?? null,
    chargingPowerKw: customerTelemetry?.chargingPowerKw ?? null,
    chargingState:
      customerTelemetry?.isCharging == null
        ? null
        : customerTelemetry.isCharging
          ? 'charging'
          : 'not_charging',
  };
}

function presentCompatSanitizedCanonicalSummary(
  hv: HvBatteryStatusCompatSummaryInput['hv'],
  customerTelemetry: HvCustomerTelemetryFields | null,
) {
  if (!hv) return null;
  return {
    ...hv,
    telemetry: customerTelemetry,
  };
}

function presentCompatSanitizedCanonical(
  canonical: HvBatteryStatusCompatSummaryInput['canonical'],
  customerTelemetry: HvCustomerTelemetryFields | null,
): HvBatteryStatusCompatSummaryInput['canonical'] {
  if (!canonical || typeof canonical !== 'object') return null;
  if (!customerTelemetry) return canonical;

  const clone = JSON.parse(JSON.stringify(canonical)) as CanonicalBatteryDto;
  if (clone.liveState?.hv || clone.hv) {
    maskCanonicalHvCustomerSurfaces(clone, customerTelemetry);
  }
  return clone;
}

function presentCompatSanitizedLegacy(
  legacy: HvBatteryStatusLegacyDiagnostic,
  customerTelemetry: HvCustomerTelemetryFields | null,
): HvBatteryStatusLegacyDiagnostic | undefined {
  if (!legacy) return undefined;
  const out: Record<string, unknown> = { ...legacy };
  out.currentSocPercent = customerTelemetry?.socPercent ?? null;
  out.estimatedRangeKm = customerTelemetry?.rangeKm ?? null;
  if (out.telemetry != null && typeof out.telemetry === 'object') {
    out.telemetry = customerTelemetry;
  }
  return out;
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
  const telemetryFresh = hvTelemetryObservationIsDecisionFresh(summary);
  const customerTelemetry = buildCompatCustomerTelemetry(summary);

  const customerSoc = customerTelemetry?.socPercent ?? null;
  const customerRange = customerTelemetry?.rangeKm ?? null;

  const customerSoh = hv?.sohPct ?? hv?.healthPercent ?? null;

  const canonicalHv: HvCompatCanonicalHvSlice | null =
    summary.canonical?.hv ?? null;
  const nominalCapacityKwh = resolveCustomerHvNominalCapacityKwh({
    referenceCapacity:
      canonicalHv?.referenceCapacity?.verificationStatus != null
        ? {
            capacityKwh: canonicalHv.referenceCapacity.capacityKwh ?? null,
            verificationStatus: canonicalHv.referenceCapacity.verificationStatus,
          }
        : null,
    legacyNominalCapacityKwh: undefined,
    telemetryGrossCapacityKwh: customerTelemetry?.grossCapacityKwh ?? null,
    carrierObservationFresh: telemetryFresh,
  });

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
    canonical: presentCompatSanitizedCanonical(summary.canonical, customerTelemetry),
    canonicalSummary: presentCompatSanitizedCanonicalSummary(hv, customerTelemetry),
    currentTelemetry: presentCompatSanitizedCurrentTelemetry(
      summary.currentTelemetry,
      customerTelemetry,
    ),
    legacy: presentCompatSanitizedLegacy(legacy, customerTelemetry),
  };
}
