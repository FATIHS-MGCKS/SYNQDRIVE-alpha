import {
  observationFreshnessIsDecisionFresh,
  type ObservationFreshness,
} from './battery-freshness.policy';
import {
  EMPTY_HV_CUSTOMER_TELEMETRY,
  type HvCustomerTelemetryFields,
  type HvCustomerTelemetryRawInput,
  presentHvCustomerTelemetryFields,
  resolveCustomerHvNominalCapacityKwh,
} from './battery-hv-customer-telemetry.presenter';
import type {
  CanonicalBatteryDto,
  CanonicalBatteryLegacySection,
} from './canonical-battery/canonical-battery.types';
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
  chargingState?: {
    isCharging?: boolean | null;
    cableConnected?: boolean | null;
    powerKw?: number | null;
  } | null;
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
    legacyCapacity?: Record<string, unknown> | null;
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

export type HvCompatLegacyCustomerProjection = {
  diagnosticOnly: true;
  telemetry: HvCustomerTelemetryFields;
};

export type HvCompatCanonicalSummaryProjection = {
  sohPct: number | null;
  healthPercent: number | null;
  method: string | null;
  sohSource: string | null;
  publicationState: string | null;
  confidence: string | null;
  snapshotCount: number;
  freshness: { observedAt?: string | null } | null;
  telemetry: HvCustomerTelemetryFields;
};

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

function resolveCompatTelemetryRaw(
  summary: HvBatteryStatusCompatSummaryInput,
): HvCustomerTelemetryRawInput {
  const hvTelemetry = summary.hv?.telemetry;
  const canonical = summary.canonical as CanonicalBatteryDto | undefined;
  const liveValues = canonical?.liveState?.hv?.values;
  const canonicalHv = summary.canonical?.hv;
  const charging = canonicalHv?.chargingState;

  return {
    socPercent:
      hvTelemetry?.socPercent ??
      liveValues?.socPercent ??
      canonicalHv?.soc?.percent ??
      summary.currentTelemetry?.socPercent ??
      null,
    rangeKm:
      hvTelemetry?.rangeKm ??
      liveValues?.rangeKm ??
      summary.currentTelemetry?.rangeKm ??
      null,
    currentEnergyKwh:
      hvTelemetry?.currentEnergyKwh ??
      liveValues?.currentEnergyKwh ??
      canonicalHv?.currentEnergy?.kwh ??
      null,
    grossCapacityKwhFromTelemetry:
      hvTelemetry?.grossCapacityKwh ?? liveValues?.grossCapacityKwh ?? null,
    addedEnergyKwh:
      hvTelemetry?.addedEnergyKwh ?? liveValues?.addedEnergyKwh ?? null,
    chargingPowerKw:
      hvTelemetry?.chargingPowerKw ??
      liveValues?.chargingPowerKw ??
      charging?.powerKw ??
      summary.currentTelemetry?.chargingPowerKw ??
      null,
    currentVoltageV:
      hvTelemetry?.currentVoltageV ?? liveValues?.currentVoltageV ?? null,
    temperatureC: hvTelemetry?.temperatureC ?? liveValues?.temperatureC ?? null,
    isCharging:
      hvTelemetry?.isCharging ??
      liveValues?.isCharging ??
      charging?.isCharging ??
      null,
    chargingCableConnected:
      hvTelemetry?.chargingCableConnected ??
      liveValues?.chargingCableConnected ??
      charging?.cableConnected ??
      null,
    providerSohPercent:
      hvTelemetry?.providerSohPercent ??
      liveValues?.providerSohPercent ??
      canonicalHv?.providerSoh?.percent ??
      null,
  };
}

function buildCompatCustomerTelemetry(
  summary: HvBatteryStatusCompatSummaryInput,
): HvCustomerTelemetryFields {
  const carrierObservationFresh = hvTelemetryObservationIsDecisionFresh(summary);
  const providerSohObservationFresh = hvProviderSohObservationIsDecisionFresh(summary);

  return presentHvCustomerTelemetryFields({
    raw: resolveCompatTelemetryRaw(summary),
    carrierObservationFresh,
    providerSohObservationFresh,
  });
}

function presentCompatSanitizedCurrentTelemetry(
  currentTelemetry: HvBatteryStatusCompatSummaryInput['currentTelemetry'],
  customerTelemetry: HvCustomerTelemetryFields,
) {
  if (!currentTelemetry) return null;
  return {
    observationFreshness: currentTelemetry.observationFreshness ?? null,
    fetchFreshness: (currentTelemetry as { fetchFreshness?: unknown }).fetchFreshness ?? null,
    freshnessBundle: (currentTelemetry as { freshnessBundle?: unknown }).freshnessBundle ?? null,
    observedAt: (currentTelemetry as { observedAt?: string | null }).observedAt ?? null,
    lvVoltageV: (currentTelemetry as { lvVoltageV?: number | null }).lvVoltageV ?? null,
    socPercent: customerTelemetry.socPercent,
    rangeKm: customerTelemetry.rangeKm,
    genericEnergyPercent: customerTelemetry.socPercent,
    chargingPowerKw: customerTelemetry.chargingPowerKw,
    chargingState:
      customerTelemetry.isCharging == null
        ? null
        : customerTelemetry.isCharging
          ? 'charging'
          : 'not_charging',
  };
}

function presentCompatSanitizedCanonicalSummary(
  hv: HvBatteryStatusCompatSummaryInput['hv'],
  customerTelemetry: HvCustomerTelemetryFields,
): HvCompatCanonicalSummaryProjection | null {
  if (!hv) return null;
  return {
    sohPct: hv.sohPct ?? hv.healthPercent ?? null,
    healthPercent: hv.healthPercent ?? null,
    method: hv.method ?? null,
    sohSource: hv.sohSource ?? null,
    publicationState: hv.publicationState ?? null,
    confidence: hv.confidence ?? null,
    snapshotCount: hv.snapshotCount ?? 0,
    freshness: hv.freshness ?? null,
    telemetry: customerTelemetry,
  };
}

function presentCompatSanitizedCanonicalLegacy(
  legacy: CanonicalBatteryLegacySection | undefined,
): CanonicalBatteryLegacySection | undefined {
  if (!legacy) return legacy;
  const hvLegacy = legacy.hvLegacyCapacity as Record<string, unknown> | null;
  return {
    ...legacy,
    collapsed: true,
    lvDiagnostic: legacy.lvDiagnostic
      ? {
          ...legacy.lvDiagnostic,
          publishedSohPct: null,
          stabilizedSohPct: null,
          rawSohPct: null,
        }
      : null,
    v2Features: legacy.v2Features
      ? {
          ...legacy.v2Features,
          publishedSohPct: null,
          stabilizedSohPct: null,
          rawSohPct: null,
        }
      : legacy.v2Features,
    hvLegacyCapacity: hvLegacy
      ? {
          displayMode: hvLegacy.displayMode,
          decisionCapable: hvLegacy.decisionCapable,
          diagnosticLabelDe: hvLegacy.diagnosticLabelDe,
          measurementMethod: hvLegacy.measurementMethod,
          snapshotCadenceMs: hvLegacy.snapshotCadenceMs,
          diagnosticEstimatedCapacityKwh: null,
          diagnosticSohPercent: null,
          operationalEstimatedCapacityKwh: null,
          operationalSohPercent: null,
        }
      : legacy.hvLegacyCapacity,
  };
}

function presentCompatSanitizedCanonical(
  canonical: HvBatteryStatusCompatSummaryInput['canonical'],
  customerTelemetry: HvCustomerTelemetryFields,
): HvBatteryStatusCompatSummaryInput['canonical'] {
  if (!canonical || typeof canonical !== 'object') return null;

  const clone = JSON.parse(JSON.stringify(canonical)) as CanonicalBatteryDto;
  const hasHvCarrier =
    clone.liveState?.hv != null ||
    clone.hv != null ||
    clone.legacy?.hvLegacyCapacity != null;

  if (hasHvCarrier) {
    maskCanonicalHvCustomerSurfaces(clone, customerTelemetry);
  }
  if (clone.legacy) {
    clone.legacy = presentCompatSanitizedCanonicalLegacy(clone.legacy) ?? clone.legacy;
  }
  return clone;
}

function presentCompatSanitizedLegacy(
  legacy: HvBatteryStatusLegacyDiagnostic,
  customerTelemetry: HvCustomerTelemetryFields,
): HvCompatLegacyCustomerProjection | undefined {
  if (!legacy) return undefined;
  return {
    diagnosticOnly: true,
    telemetry: customerTelemetry,
  };
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

  const customerSoc = customerTelemetry.socPercent;
  const customerRange = customerTelemetry.rangeKm;

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
    telemetryGrossCapacityKwh: customerTelemetry.grossCapacityKwh,
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

export { EMPTY_HV_CUSTOMER_TELEMETRY };
