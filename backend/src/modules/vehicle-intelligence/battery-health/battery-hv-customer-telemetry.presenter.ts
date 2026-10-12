import type { ObservationFreshness } from './battery-freshness.policy';
import { observationFreshnessIsDecisionFresh } from './battery-freshness.policy';
import type { CanonicalBatteryHvReferenceCapacity } from './canonical-battery/canonical-battery.types';

export const EMPTY_HV_CUSTOMER_TELEMETRY: HvCustomerTelemetryFields = {
  socPercent: null,
  rangeKm: null,
  currentEnergyKwh: null,
  grossCapacityKwh: null,
  addedEnergyKwh: null,
  chargingPowerKw: null,
  currentVoltageV: null,
  temperatureC: null,
  isCharging: null,
  chargingCableConnected: null,
  providerSohPercent: null,
};

export type HvCustomerTelemetryFields = {
  socPercent: number | null;
  rangeKm: number | null;
  currentEnergyKwh: number | null;
  grossCapacityKwh: number | null;
  addedEnergyKwh: number | null;
  chargingPowerKw: number | null;
  currentVoltageV: number | null;
  temperatureC: number | null;
  isCharging: boolean | null;
  chargingCableConnected: boolean | null;
  providerSohPercent: number | null;
};

export type HvCustomerTelemetryRawInput = {
  socPercent: number | null;
  rangeKm: number | null;
  currentEnergyKwh: number | null;
  grossCapacityKwhFromTelemetry: number | null;
  addedEnergyKwh: number | null;
  chargingPowerKw: number | null;
  currentVoltageV: number | null;
  temperatureC: number | null;
  isCharging: boolean | null;
  chargingCableConnected: boolean | null;
  providerSohPercent: number | null;
};

export function hvCarrierObservationIsDecisionFresh(
  observationFreshness: ObservationFreshness | null | undefined,
): boolean {
  if (!observationFreshness) return false;
  return observationFreshnessIsDecisionFresh(observationFreshness);
}

export function isVerifiedHvReferenceCapacity(
  reference:
    | { verificationStatus?: string | null }
    | null
    | undefined,
): boolean {
  if (!reference?.verificationStatus) return false;
  return String(reference.verificationStatus).toUpperCase() === 'VERIFIED';
}

/**
 * Customer-facing HV dynamic telemetry: fail closed when the carrier observation
 * (vehicle latest-state source timestamp) is stale or missing. Provider SOH is gated
 * separately on provider observation freshness.
 */
export function presentHvCustomerTelemetryFields(input: {
  raw: HvCustomerTelemetryRawInput;
  carrierObservationFresh: boolean;
  providerSohObservationFresh: boolean;
}): HvCustomerTelemetryFields {
  if (!input.carrierObservationFresh) {
    return {
      socPercent: null,
      rangeKm: null,
      currentEnergyKwh: null,
      grossCapacityKwh: null,
      addedEnergyKwh: null,
      chargingPowerKw: null,
      currentVoltageV: null,
      temperatureC: null,
      isCharging: null,
      chargingCableConnected: null,
      providerSohPercent: input.providerSohObservationFresh
        ? input.raw.providerSohPercent
        : null,
    };
  }

  return {
    socPercent: input.raw.socPercent,
    rangeKm: input.raw.rangeKm,
    currentEnergyKwh: input.raw.currentEnergyKwh,
    grossCapacityKwh: input.raw.grossCapacityKwhFromTelemetry,
    addedEnergyKwh: input.raw.addedEnergyKwh,
    chargingPowerKw: input.raw.chargingPowerKw,
    currentVoltageV: input.raw.currentVoltageV,
    temperatureC: input.raw.temperatureC,
    isCharging: input.raw.isCharging,
    chargingCableConnected: input.raw.chargingCableConnected,
    providerSohPercent: input.providerSohObservationFresh
      ? input.raw.providerSohPercent
      : null,
  };
}

export function resolveCustomerHvNominalCapacityKwh(input: {
  referenceCapacity:
    | {
        capacityKwh?: number | null;
        verificationStatus?: string | null;
      }
    | null
    | undefined;
  legacyNominalCapacityKwh?: number | null;
  telemetryGrossCapacityKwh?: number | null;
  carrierObservationFresh: boolean;
}): number | null {
  if (
    isVerifiedHvReferenceCapacity(input.referenceCapacity) &&
    input.referenceCapacity?.capacityKwh != null
  ) {
    return input.referenceCapacity.capacityKwh;
  }
  if (input.carrierObservationFresh && input.telemetryGrossCapacityKwh != null) {
    return input.telemetryGrossCapacityKwh;
  }
  return null;
}
