import type { CanonicalBatteryDto } from './canonical-battery/canonical-battery.types';
import type { LvCanonicalLegacyDiagnostic } from './lv-canonical/lv-canonical-battery.types';
import {
  type HvCustomerTelemetryFields,
  presentHvCustomerTelemetryFields,
} from './battery-hv-customer-telemetry.presenter';

type LegacyHvCapacityPresentation = {
  displayMode?: string;
  decisionCapable?: boolean;
  diagnosticEstimatedCapacityKwh?: number | null;
  diagnosticSohPercent?: number | null;
  operationalEstimatedCapacityKwh?: number | null;
  operationalSohPercent?: number | null;
};

type CustomerBatterySummaryLike = {
  hv?: {
    telemetry?: HvCustomerTelemetryFields | null;
    legacyCapacity?: LegacyHvCapacityPresentation | null;
  } | null;
  currentTelemetry?: {
    socPercent?: number | null;
    rangeKm?: number | null;
    chargingState?: string | null;
    chargingPowerKw?: number | null;
    genericEnergyPercent?: number | null;
    lvVoltageV?: number | null;
    observationFreshness?: unknown;
  } | null;
  canonical?: CanonicalBatteryDto | null;
};

export type CustomerBatterySummaryBoundaryOptions = {
  /** True when LV published SOH may appear on customer surfaces (publication ON + safety gates). */
  lvPublicationCustomerVisible: boolean;
};

const HV_LIVE_VALUE_KEYS = [
  'socPercent',
  'rangeKm',
  'currentEnergyKwh',
  'grossCapacityKwh',
  'addedEnergyKwh',
  'chargingPowerKw',
  'currentVoltageV',
  'temperatureC',
  'isCharging',
  'chargingCableConnected',
  'providerSohPercent',
] as const;

function redactCustomerLegacyLvDiagnostic(
  diagnostic: LvCanonicalLegacyDiagnostic | null | undefined,
): LvCanonicalLegacyDiagnostic | null {
  if (!diagnostic) return null;
  if (diagnostic.decisionCapable) return diagnostic;
  return {
    ...diagnostic,
    publishedSohPct: null,
    stabilizedSohPct: null,
    rawSohPct: null,
  };
}

function redactCustomerLegacyV2Features<
  T extends {
    publishedSohPct: number | null;
    stabilizedSohPct: number | null;
    rawSohPct: number | null;
    publicationState: string | null;
    scoredAt: string | null;
  } | null,
>(v2Features: T, publicationCustomerVisible: boolean): T {
  if (!v2Features) return v2Features;
  if (publicationCustomerVisible) return v2Features;
  return {
    ...v2Features,
    publishedSohPct: null,
    stabilizedSohPct: null,
    rawSohPct: null,
  };
}

function redactCustomerHvLegacyCapacity(
  legacyCapacity: LegacyHvCapacityPresentation | null | undefined,
): LegacyHvCapacityPresentation | null | undefined {
  if (!legacyCapacity) return legacyCapacity;
  if (legacyCapacity.decisionCapable) return legacyCapacity;
  return {
    ...legacyCapacity,
    diagnosticEstimatedCapacityKwh: null,
    diagnosticSohPercent: null,
    operationalEstimatedCapacityKwh: null,
    operationalSohPercent: null,
  };
}

function maskCanonicalHvCustomerSurfaces(
  canonical: CanonicalBatteryDto,
  customerHvTelemetry: HvCustomerTelemetryFields,
): void {
  if (canonical.hv) {
    canonical.hv.soc.percent = customerHvTelemetry.socPercent;
    canonical.hv.currentEnergy.kwh = customerHvTelemetry.currentEnergyKwh;
    if (canonical.hv.providerSoh) {
      canonical.hv.providerSoh.percent = customerHvTelemetry.providerSohPercent;
    }
    if (canonical.hv.chargingState) {
      canonical.hv.chargingState.isCharging = customerHvTelemetry.isCharging;
      canonical.hv.chargingState.cableConnected =
        customerHvTelemetry.chargingCableConnected;
      canonical.hv.chargingState.powerKw = customerHvTelemetry.chargingPowerKw;
      canonical.hv.chargingState.state =
        customerHvTelemetry.isCharging == null
          ? 'unknown'
          : customerHvTelemetry.isCharging
            ? 'charging'
            : 'not_charging';
    }
  }

  const hvLive = canonical.liveState?.hv;
  if (!hvLive) return;

  hvLive.values = {
    ...hvLive.values,
    socPercent: customerHvTelemetry.socPercent,
    rangeKm: customerHvTelemetry.rangeKm,
    currentEnergyKwh: customerHvTelemetry.currentEnergyKwh,
    grossCapacityKwh: customerHvTelemetry.grossCapacityKwh,
    addedEnergyKwh: customerHvTelemetry.addedEnergyKwh,
    chargingPowerKw: customerHvTelemetry.chargingPowerKw,
    currentVoltageV: customerHvTelemetry.currentVoltageV,
    temperatureC: customerHvTelemetry.temperatureC,
    isCharging: customerHvTelemetry.isCharging,
    chargingCableConnected: customerHvTelemetry.chargingCableConnected,
    providerSohPercent: customerHvTelemetry.providerSohPercent,
  };

  for (const key of HV_LIVE_VALUE_KEYS) {
    const envelope = hvLive.signals[key];
    if (!envelope || typeof envelope !== 'object') continue;
    const maskedValue = customerHvTelemetry[key];
    (envelope as { value: unknown }).value = maskedValue;
  }
}

/**
 * Applies customer-facing presentation boundaries on an assembled battery summary.
 * Canonical signal freshness metadata is preserved; dynamic "current" values are masked.
 */
export function applyCustomerFacingBatterySummaryBoundaries<
  T extends CustomerBatterySummaryLike,
>(
  summary: T,
  customerHvTelemetry: HvCustomerTelemetryFields,
  options: CustomerBatterySummaryBoundaryOptions,
): T {
  if (summary.hv?.telemetry) {
    summary.hv.telemetry = { ...customerHvTelemetry };
  }

  if (summary.hv?.legacyCapacity) {
    summary.hv.legacyCapacity = redactCustomerHvLegacyCapacity(
      summary.hv.legacyCapacity,
    ) as typeof summary.hv.legacyCapacity;
  }

  if (summary.currentTelemetry) {
    summary.currentTelemetry.socPercent = customerHvTelemetry.socPercent;
    summary.currentTelemetry.rangeKm = customerHvTelemetry.rangeKm;
    summary.currentTelemetry.genericEnergyPercent = customerHvTelemetry.socPercent;
    summary.currentTelemetry.chargingPowerKw = customerHvTelemetry.chargingPowerKw;
    if (!customerHvTelemetry.isCharging && customerHvTelemetry.isCharging !== false) {
      summary.currentTelemetry.chargingState = null;
    } else {
      summary.currentTelemetry.chargingState = customerHvTelemetry.isCharging
        ? 'charging'
        : 'not_charging';
    }
  }

  const canonical = summary.canonical;
  if (canonical) {
    maskCanonicalHvCustomerSurfaces(canonical, customerHvTelemetry);
    if (canonical.legacy) {
      canonical.legacy = {
        ...canonical.legacy,
        lvDiagnostic: redactCustomerLegacyLvDiagnostic(canonical.legacy.lvDiagnostic),
        v2Features: redactCustomerLegacyV2Features(
          canonical.legacy.v2Features,
          options.lvPublicationCustomerVisible,
        ),
      };
    }
  }

  return summary;
}

export { presentHvCustomerTelemetryFields };
