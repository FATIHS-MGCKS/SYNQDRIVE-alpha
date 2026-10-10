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

/**
 * Applies customer-facing presentation boundaries on an assembled battery summary.
 * Canonical signal freshness metadata is preserved; dynamic "current" values are masked.
 */
export function applyCustomerFacingBatterySummaryBoundaries<
  T extends CustomerBatterySummaryLike,
>(summary: T, customerHvTelemetry: HvCustomerTelemetryFields): T {
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
  if (canonical?.hv) {
    canonical.hv.soc.percent = customerHvTelemetry.socPercent;
    canonical.hv.currentEnergy.kwh = customerHvTelemetry.currentEnergyKwh;
  }

  if (canonical?.legacy) {
    canonical.legacy = {
      ...canonical.legacy,
      lvDiagnostic: redactCustomerLegacyLvDiagnostic(canonical.legacy.lvDiagnostic),
    };
  }

  return summary;
}

export { presentHvCustomerTelemetryFields };
